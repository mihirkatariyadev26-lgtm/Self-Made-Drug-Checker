import axios from "axios";

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";
const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

const http = axios.create({
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "User-Agent": "DDI-Checker/1.0",
  },
});

// ---------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToRegex(alias) {
  const normalized = normalizeName(alias);

  if (!normalized) {
    return null;
  }

  const tokens = normalized.split(" ").filter(Boolean).map(escapeRegex);

  // Allows spaces / hyphens / slashes between words.
  const pattern = tokens.join("[\\s\\-/]+");

  return new RegExp(`\\b${pattern}\\b`, "i");
}

function containsDrugName(text, aliases) {
  if (!text || !Array.isArray(aliases)) {
    return false;
  }

  return aliases.some((alias) => {
    const regex = aliasToRegex(alias);
    return regex ? regex.test(text) : false;
  });
}

function findDrugMatch(text, aliases) {
  if (!text || !Array.isArray(aliases)) {
    return null;
  }

  for (const alias of aliases) {
    const regex = aliasToRegex(alias);

    if (!regex) {
      continue;
    }

    const match = regex.exec(text);

    if (match) {
      return {
        alias,
        index: match.index,
        length: match[0].length,
      };
    }
  }

  return null;
}

function fieldToText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => fieldToText(item))
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => fieldToText(item))
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function cleanEvidence(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractEvidenceBlock(text, targetAliases) {
  const match = findDrugMatch(text, targetAliases);

  if (!match) {
    return null;
  }

  const index = match.index;

  // Start shortly before the exact drug mention.
  let start = Math.max(0, index - 500);

  // Prefer paragraph boundary when available.
  const paragraphStart = text.lastIndexOf("\n\n", index);

  if (paragraphStart >= 0 && paragraphStart > index - 900) {
    start = paragraphStart + 2;
  }

  // Include enough text after the drug mention to capture
  // mechanism + effect + recommendation.
  let end = Math.min(text.length, index + 1300);

  const paragraphEnd = text.indexOf("\n\n", index + match.length);

  if (paragraphEnd >= 0 && paragraphEnd < end) {
    end = paragraphEnd;
  }

  return cleanEvidence(text.slice(start, end));
}

// ---------------------------------------------------------
// RxNorm resolution
// ---------------------------------------------------------

async function getRxNormProperties(rxcui) {
  const response = await http.get(
    `${RXNORM_BASE}/rxcui/${rxcui}/properties.json`,
  );

  return response.data?.properties || null;
}

async function getIngredientConcepts(rxcui) {
  try {
    const response = await http.get(
      `${RXNORM_BASE}/rxcui/${rxcui}/related.json`,
      {
        params: {
          tty: "IN",
        },
      },
    );

    return response.data?.relatedGroup?.conceptProperties || [];
  } catch {
    return [];
  }
}

async function resolveDrug(drugInput) {
  const input = String(drugInput || "").trim();

  if (!input) {
    return {
      input,
      found: false,
      reason: "EMPTY_INPUT",
    };
  }

  try {
    // Exact-or-normalized RxNorm lookup.
    // search=2 = exact OR normalized.
    const response = await http.get(`${RXNORM_BASE}/rxcui.json`, {
      params: {
        name: input,
        search: 2,
      },
    });

    const ids = response.data?.idGroup?.rxnormId || [];

    if (!ids.length) {
      return {
        input,
        found: false,
        reason: "RXNORM_NOT_FOUND",
      };
    }

    // Get properties for returned candidates.
    const candidates = [];

    for (const id of ids.slice(0, 10)) {
      try {
        const properties = await getRxNormProperties(id);

        if (properties) {
          candidates.push({
            rxcui: id,
            ...properties,
          });
        }
      } catch {
        // Ignore one bad candidate and continue.
      }
    }

    if (!candidates.length) {
      return {
        input,
        found: false,
        reason: "RXNORM_PROPERTIES_UNAVAILABLE",
      };
    }

    // Prefer ingredient concepts where possible.
    const ttyPriority = {
      IN: 1,
      PIN: 2,
      MIN: 3,
      SCD: 4,
      SBDC: 5,
      SBD: 6,
      SCDF: 7,
      SBDF: 8,
      BN: 9,
    };

    candidates.sort(
      (a, b) => (ttyPriority[a.tty] || 100) - (ttyPriority[b.tty] || 100),
    );

    const selected = candidates[0];

    // Get all ingredient concepts.
    let ingredientConcepts = await getIngredientConcepts(selected.rxcui);

    // If the selected concept itself is an ingredient.
    if (!ingredientConcepts.length && ["IN", "PIN"].includes(selected.tty)) {
      ingredientConcepts = [
        {
          rxcui: selected.rxcui,
          name: selected.name,
          synonym: selected.synonym,
          tty: selected.tty,
        },
      ];
    }

    const ingredients = unique(ingredientConcepts.map((item) => item.name));

    const ingredientRxcuis = unique(
      ingredientConcepts.map((item) => item.rxcui),
    );

    const aliases = unique([
      input,
      selected.name,
      selected.synonym,
      ...ingredientConcepts.map((item) => item.name),
      ...ingredientConcepts.map((item) => item.synonym),
    ]);

    return {
      input,
      found: true,

      // Selected RxNorm concept.
      rxcui: selected.rxcui,
      rxnormName: selected.name,
      tty: selected.tty,

      // Base ingredients.
      ingredients,
      ingredientRxcuis,

      // Names we are allowed to match in FDA evidence.
      aliases,

      // Convenient generic value for API searches.
      generic: ingredients[0] || selected.name || input,
    };
  } catch (error) {
    return {
      input,
      found: false,
      reason: "RXNORM_API_ERROR",
      error: error.message,
    };
  }
}

// ---------------------------------------------------------
// openFDA retrieval
// ---------------------------------------------------------

function safeFDAQueryTerm(value) {
  return String(value || "")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFDARecordsForDrug(victimDrug) {
  const searchTerms = unique([victimDrug.generic, ...victimDrug.ingredients]);

  const allRecords = [];

  for (const term of searchTerms) {
    const safeTerm = safeFDAQueryTerm(term);

    if (!safeTerm) {
      continue;
    }

    try {
      const response = await http.get(OPENFDA_BASE, {
        params: {
          search: `openfda.generic_name:"${safeTerm}" AND _exists_:drug_interactions`,
          limit: 50,
        },
      });

      const records = response.data?.results || [];

      allRecords.push(
        ...records.map((record) => ({
          ...record,
          _queryTerm: safeTerm,
        })),
      );
    } catch (error) {
      // 404 = no records for this search.
      if (error.response?.status === 404) {
        continue;
      }

      // Anything else is an actual API failure.
      throw error;
    }
  }

  // Deduplicate labels.
  const seen = new Set();

  return allRecords.filter((record) => {
    const key =
      record.set_id ||
      record.id ||
      `${record.effective_time || ""}|${record._queryTerm || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------
// Deterministic evidence interpretation
// ---------------------------------------------------------

const MECHANISM_RULES = [
  {
    pattern: /strong\s+cyp3a(?:4)?\s+inhibitor/i,
    value: "Strong CYP3A inhibitor",
  },
  {
    pattern: /strong\s+cyp3a(?:4)?\s+inducer/i,
    value: "Strong CYP3A inducer",
  },
  {
    pattern: /cyp3a(?:4)?\s+inhibitor/i,
    value: "CYP3A inhibitor",
  },
  {
    pattern: /cyp3a(?:4)?\s+inducer/i,
    value: "CYP3A inducer",
  },
  {
    pattern: /p-gp\s+inhibitor|p-glycoprotein\s+inhibitor/i,
    value: "P-gp inhibitor",
  },
  {
    pattern: /p-gp\s+inducer|p-glycoprotein\s+inducer/i,
    value: "P-gp inducer",
  },
  {
    pattern: /cyp2c9\s+inhibitor/i,
    value: "CYP2C9 inhibitor",
  },
  {
    pattern: /cyp2c19\s+inhibitor/i,
    value: "CYP2C19 inhibitor",
  },
];

function extractMechanism(text) {
  const mechanisms = [];

  for (const rule of MECHANISM_RULES) {
    if (rule.pattern.test(text)) {
      mechanisms.push(rule.value);
    }
  }

  return unique(mechanisms);
}

function extractExposureDirection(text) {
  const increasePatterns = [
    /\b(?:increase|increases|increased|elevate|elevated)\b.{0,120}\b(?:exposure|concentration|concentrations|levels|level|trough)\b/i,
    /\b(?:exposure|concentration|concentrations|levels|level|trough)\b.{0,120}\b(?:increase|increases|increased|elevate|elevated)\b/i,
  ];

  const decreasePatterns = [
    /\b(?:decrease|decreases|decreased|reduce|reduced|lower|lowers)\b.{0,120}\b(?:exposure|concentration|concentrations|levels|level|trough)\b/i,
    /\b(?:exposure|concentration|concentrations|levels|level|trough)\b.{0,120}\b(?:decrease|decreases|decreased|reduce|reduced|lower|lowers)\b/i,
  ];

  if (increasePatterns.some((p) => p.test(text))) {
    return "INCREASE";
  }

  if (decreasePatterns.some((p) => p.test(text))) {
    return "DECREASE";
  }

  return "UNKNOWN";
}

function extractClinicalConsequences(text) {
  const consequences = [];

  const rules = [
    {
      pattern: /risk of serious adverse reactions?/i,
      value: "Increased risk of serious adverse reactions",
    },
    {
      pattern: /risk of rejection/i,
      value: "Increased risk of rejection",
    },
    {
      pattern: /risk of toxicity|tacrolimus toxicity/i,
      value: "Increased toxicity risk",
    },
    {
      pattern: /risk of bleeding|major bleeding/i,
      value: "Increased bleeding risk",
    },
    {
      pattern: /myopathy|rhabdomyolysis/i,
      value: "Myopathy/rhabdomyolysis risk",
    },
    {
      pattern: /nephrotoxicity/i,
      value: "Nephrotoxicity risk",
    },
    {
      pattern: /neurotoxicity/i,
      value: "Neurotoxicity risk",
    },
    {
      pattern: /therapeutic effect|therapeutic efficacy/i,
      value: "Altered therapeutic effect",
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      consequences.push(rule.value);
    }
  }

  return unique(consequences);
}

function extractRecommendation(text) {
  const recommendations = [];

  if (
    /avoid concomitant use|avoid concurrent use|contraindicated/i.test(text)
  ) {
    recommendations.push("AVOID_COMBINATION");
  }

  if (
    /reduce .*dose|dose reduction|reduce the dose|dose should be reduced/i.test(
      text,
    )
  ) {
    recommendations.push("REDUCE_DOSE");
  }

  if (
    /increase .*dose|increase the dose|dose should be increased/i.test(text)
  ) {
    recommendations.push("INCREASE_DOSE");
  }

  if (
    /monitor .*concentration|monitor .*levels|therapeutic drug monitoring|closely monitor|frequent monitoring/i.test(
      text,
    )
  ) {
    recommendations.push("MONITOR");
  }

  if (/adjust dose|dose adjustment/i.test(text)) {
    recommendations.push("DOSE_ADJUSTMENT");
  }

  return unique(recommendations);
}

// ---------------------------------------------------------
// Deterministic severity policy
// ---------------------------------------------------------
//
// IMPORTANT:
// This is YOUR application's rule, not an official FDA severity field.
// For a production clinical system, standard severity should come from
// a validated/licensed DDI database.
//
// ---------------------------------------------------------

function deriveSeverity(text, recommendations, consequences) {
  const lower = text.toLowerCase();

  if (
    /contraindicated|avoid concomitant use|avoid concurrent use/i.test(lower)
  ) {
    return {
      value: "MAJOR",
      source: "APPLICATION_LABEL_RULE",
      rule: "CONTRAINDICATED_OR_AVOID",
    };
  }

  if (
    /serious adverse reactions?|risk of rejection|life-threatening|rhabdomyolysis|major bleeding/i.test(
      lower,
    )
  ) {
    return {
      value: "MAJOR",
      source: "APPLICATION_LABEL_RULE",
      rule: "SERIOUS_CLINICAL_CONSEQUENCE",
    };
  }

  if (
    recommendations.includes("REDUCE_DOSE") ||
    recommendations.includes("INCREASE_DOSE") ||
    recommendations.includes("DOSE_ADJUSTMENT")
  ) {
    return {
      value: "MODERATE",
      source: "APPLICATION_LABEL_RULE",
      rule: "DOSE_ADJUSTMENT",
    };
  }

  if (recommendations.includes("MONITOR") || consequences.length > 0) {
    return {
      value: "MODERATE",
      source: "APPLICATION_LABEL_RULE",
      rule: "MONITORING_OR_CLINICAL_CONSEQUENCE",
    };
  }

  return {
    value: "UNKNOWN",
    source: "NONE",
    rule: null,
  };
}

// ---------------------------------------------------------
// Formulation / combination detection
// ---------------------------------------------------------

function detectCombinationEvidence(evidence, targetDrug) {
  const normalizedEvidence = normalizeName(evidence);

  // Single-ingredient drug being checked.
  if (targetDrug.ingredients.length <= 1) {
    // Detect common combination wording.
    // Example:
    // "sulfamethoxazole and trimethoprim"
    const ingredientName = normalizeName(
      targetDrug.ingredients[0] || targetDrug.generic,
    );

    const hasCombinationWording =
      normalizedEvidence.includes(`${ingredientName} and`) ||
      normalizedEvidence.includes(`and ${ingredientName}`) ||
      normalizedEvidence.includes(`${ingredientName} /`);

    if (hasCombinationWording) {
      return "FORMULATION_OR_COMBINATION";
    }
  }

  return "DIRECT_PAIR";
}

// ---------------------------------------------------------
// Find exact interaction evidence
// ---------------------------------------------------------

function analyzeFDARecord(record, victimDrug, interactingDrug) {
  const interactionText = fieldToText(record.drug_interactions);

  if (!interactionText) {
    return null;
  }

  const evidence = extractEvidenceBlock(
    interactionText,
    interactingDrug.aliases,
  );

  if (!evidence) {
    return null;
  }

  const mechanisms = extractMechanism(evidence);
  const exposureDirection = extractExposureDirection(evidence);
  const consequences = extractClinicalConsequences(evidence);
  const recommendations = extractRecommendation(evidence);

  // This prevents a random occurrence of a drug name from being
  // treated as a DDI.
  const hasInteractionSignal =
    mechanisms.length > 0 ||
    exposureDirection !== "UNKNOWN" ||
    consequences.length > 0 ||
    recommendations.length > 0 ||
    /\binteraction\b|\binteracting\b|\bcoadminister/i.test(evidence);

  if (!hasInteractionSignal) {
    return null;
  }

  const relationship = detectCombinationEvidence(evidence, interactingDrug);

  const severity = deriveSeverity(evidence, recommendations, consequences);

  return {
    relationship,
    evidence,
    mechanisms,
    exposureDirection,
    clinicalConsequences: consequences,
    recommendations,
    severity,

    source: {
      type: "openFDA",
      section: "drug_interactions",
      effectiveTime: record.effective_time || null,
      setId: record.set_id || null,
      labelId: record.id || null,
    },
  };
}

// ---------------------------------------------------------
// Search both directions
// ---------------------------------------------------------

async function findPairEvidence(drug1, drug2) {
  const evidenceResults = [];

  // Direction 1:
  // FDA label for Drug 1 mentions Drug 2.
  const drug1Labels = await fetchFDARecordsForDrug(drug1);

  for (const record of drug1Labels) {
    const result = analyzeFDARecord(record, drug1, drug2);

    if (result) {
      evidenceResults.push({
        victim: drug1.generic,
        interactingDrug: drug2.generic,
        direction: `${drug2.generic} -> ${drug1.generic}`,
        ...result,
      });
    }
  }

  // Direction 2:
  // FDA label for Drug 2 mentions Drug 1.
  const drug2Labels = await fetchFDARecordsForDrug(drug2);

  for (const record of drug2Labels) {
    const result = analyzeFDARecord(record, drug2, drug1);

    if (result) {
      evidenceResults.push({
        victim: drug2.generic,
        interactingDrug: drug1.generic,
        direction: `${drug1.generic} -> ${drug2.generic}`,
        ...result,
      });
    }
  }

  // Remove duplicate evidence.
  const seen = new Set();

  const uniqueResults = evidenceResults.filter((item) => {
    const key = [
      item.source.setId,
      item.victim,
      item.interactingDrug,
      item.evidence,
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return uniqueResults;
}

// ---------------------------------------------------------
// Rank evidence
// ---------------------------------------------------------

function evidenceScore(item) {
  let score = 0;

  if (item.relationship === "DIRECT_PAIR") {
    score += 10;
  }

  if (item.relationship === "FORMULATION_OR_COMBINATION") {
    score += 5;
  }

  if (item.mechanisms.length > 0) {
    score += 3;
  }

  if (item.exposureDirection !== "UNKNOWN") {
    score += 3;
  }

  if (item.clinicalConsequences.length > 0) {
    score += 3;
  }

  if (item.recommendations.length > 0) {
    score += 3;
  }

  if (item.severity.value === "MAJOR") {
    score += 2;
  }

  return score;
}

// ---------------------------------------------------------
// Main controller
// ---------------------------------------------------------

export const checkDrugInteraction = async (req, res) => {
  try {
    const { drug1, drug2 } = req.body;

    if (
      typeof drug1 !== "string" ||
      typeof drug2 !== "string" ||
      !drug1.trim() ||
      !drug2.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Both drug1 and drug2 are required.",
      });
    }

    // -----------------------------------------------------
    // 1. Resolve drugs
    // -----------------------------------------------------

    const [drug1Data, drug2Data] = await Promise.all([
      resolveDrug(drug1),
      resolveDrug(drug2),
    ]);

    if (!drug1Data.found || !drug2Data.found) {
      return res.status(404).json({
        success: false,
        status: "DRUG_NOT_RESOLVED",
        message: "One or both medications could not be resolved in RxNorm.",
        drug1: drug1Data,
        drug2: drug2Data,
      });
    }

    // Same normalized drug.
    const drug1IngredientIds = new Set(drug1Data.ingredientRxcuis);
    const sameDrug = drug2Data.ingredientRxcuis.some((id) =>
      drug1IngredientIds.has(id),
    );

    if (sameDrug) {
      return res.json({
        success: true,
        status: "SAME_DRUG",
        hasInteraction: false,
        drug1: drug1Data,
        drug2: drug2Data,
        interaction: null,
      });
    }

    // -----------------------------------------------------
    // 2. Find exact pair evidence
    // -----------------------------------------------------

    let evidenceResults;

    try {
      evidenceResults = await findPairEvidence(drug1Data, drug2Data);
    } catch (error) {
      console.error("openFDA error:", error.message);

      return res.status(503).json({
        success: false,
        status: "EVIDENCE_SOURCE_UNAVAILABLE",
        message:
          "The FDA label data source could not be queried. No interaction conclusion was made.",
        drug1: drug1Data,
        drug2: drug2Data,
      });
    }

    // -----------------------------------------------------
    // 3. No direct pair evidence
    // -----------------------------------------------------

    if (!evidenceResults.length) {
      return res.json({
        success: true,
        status: "NO_DIRECT_EVIDENCE",
        hasInteraction: false,

        drug1: drug1Data,
        drug2: drug2Data,

        interaction: null,

        message:
          "No direct drug-pair interaction evidence was found in the retrieved FDA drug-interaction label sections.",
      });
    }

    // -----------------------------------------------------
    // 4. Pick strongest evidence
    // -----------------------------------------------------

    evidenceResults.sort((a, b) => evidenceScore(b) - evidenceScore(a));

    const best = evidenceResults[0];

    // -----------------------------------------------------
    // 5. Final structured output
    // -----------------------------------------------------

    const response = {
      success: true,
      status: "INTERACTION_EVIDENCE_FOUND",

      drug1: drug1Data,
      drug2: drug2Data,

      hasInteraction: true,

      interaction: {
        evidenceMatch: best.relationship,

        direction: best.direction,

        mechanism: best.mechanisms,

        effectOnVictimDrug: best.exposureDirection,

        clinicalConsequences: best.clinicalConsequences,

        recommendations: best.recommendations,

        // IMPORTANT:
        // This severity comes from your deterministic label rule,
        // NOT an FDA severity field.
        severity: best.severity.value,

        severitySource: best.severity.source,

        severityRule: best.severity.rule,

        evidence: best.evidence,

        source: best.source,
      },

      evidenceCount: evidenceResults.length,

      // Useful for debugging / auditing.
      alternativeEvidence: evidenceResults.slice(1, 5),
    };

    return res.json(response);
  } catch (error) {
    console.error("DDI checker error:", error);

    return res.status(500).json({
      success: false,
      status: "INTERNAL_ERROR",
      error: "Internal server error while processing interaction check.",
    });
  }
};
