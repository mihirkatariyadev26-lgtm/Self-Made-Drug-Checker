import { useState } from "react";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M16 3.5 26 7v8.1c0 6.5-4.3 11.4-10 13.4-5.7-2-10-6.9-10-13.4V7l10-3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M16 10v12M10 16h12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function MedicineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m7.1 16.9 9.8-9.8a4.2 4.2 0 0 1 5.9 5.9L13 22.8a4.2 4.2 0 0 1-5.9-5.9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m10 14 5.9 5.9M2.6 5.4l2.8-2.8a4 4 0 0 1 5.7 0l1.1 1.1a4 4 0 0 1 0 5.7l-2.8 2.8a4 4 0 0 1-5.7 0L2.6 11a4 4 0 0 1 0-5.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function formatLabel(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function MetadataList({ label, values, emptyLabel = "Not specified in label" }) {
  const items = Array.isArray(values)
    ? values.filter((value) => typeof value === "string" && value.trim())
    : [];

  return (
    <div className="metadata-row">
      <span className="metadata-label">{label}</span>
      {items.length ? (
        <div className="metadata-values">
          {items.map((value) => (
            <span className="metadata-chip" key={value}>
              {formatLabel(value)}
            </span>
          ))}
        </div>
      ) : (
        <span className="metadata-empty">{emptyLabel}</span>
      )}
    </div>
  );
}

function DrugSummary({ drug, number }) {
  if (!drug) return null;

  const aliases = Array.isArray(drug.aliases)
    ? drug.aliases.filter(
        (alias) =>
          alias &&
          alias.toLowerCase() !== drug.input?.toLowerCase() &&
          alias.toLowerCase() !== drug.generic?.toLowerCase(),
      )
    : [];

  return (
    <div className={`drug-summary ${drug.found ? "" : "drug-summary--missing"}`}>
      <span className="summary-number">0{number}</span>
      <div>
        <span className="summary-label">{drug.input}</span>
        {drug.generic && (
          <span className="summary-generic">
            Generic ingredient: {drug.generic}
          </span>
        )}
        <span className="summary-state">
          <span className="state-dot" />
          {drug.found ? "Identified in RxNorm" : "Could not be identified"}
        </span>
        {drug.found && (drug.rxnormName || drug.rxcui || drug.tty) && (
          <div className="drug-identifiers">
            {drug.rxnormName && <span>RxNorm name: {drug.rxnormName}</span>}
            {drug.rxcui && <span>RxCUI: {drug.rxcui}</span>}
            {drug.tty && <span>TTY: {drug.tty}</span>}
          </div>
        )}
        {Array.isArray(drug.ingredients) && drug.ingredients.length > 0 && (
          <p className="drug-ingredients">
            Ingredients: {drug.ingredients.join(", ")}
          </p>
        )}
        {Array.isArray(drug.ingredientRxcuis) &&
          drug.ingredientRxcuis.length > 0 && (
            <p className="drug-ingredients">
              Ingredient RxCUIs: {drug.ingredientRxcuis.join(", ")}
            </p>
          )}
        {aliases.length > 0 && (
          <details className="drug-aliases">
            <summary>Other names ({aliases.length})</summary>
            <span>{aliases.join(", ")}</span>
          </details>
        )}
      </div>
    </div>
  );
}

function InteractionEvidence({ interaction }) {
  if (!interaction) return null;

  const severity =
    typeof interaction.severity === "string"
      ? interaction.severity
      : interaction.severity?.value;
  const source = interaction.source;
  const effectiveDate = source?.effectiveTime;
  const formattedDate =
    effectiveDate && /^\d{8}$/.test(effectiveDate)
      ? `${effectiveDate.slice(0, 4)}-${effectiveDate.slice(4, 6)}-${effectiveDate.slice(6, 8)}`
      : effectiveDate;

  return (
    <div className="interaction-data">
      <div className="interaction-overview">
        <div className="interaction-direction">
          <span className="metadata-label">Reported direction</span>
          <strong>{interaction.direction || "Direction not specified"}</strong>
        </div>
        {severity && (
          <div className={`severity-badge severity-badge--${severity.toLowerCase()}`}>
            <span>Reported severity</span>
            <strong>{formatLabel(severity)}</strong>
          </div>
        )}
      </div>

      {(interaction.evidenceMatch || interaction.effectOnVictimDrug) && (
        <div className="interaction-facts">
          {interaction.evidenceMatch && (
            <div className="interaction-fact">
              <span className="metadata-label">Evidence match</span>
              <strong>{formatLabel(interaction.evidenceMatch)}</strong>
            </div>
          )}
          {interaction.effectOnVictimDrug && (
            <div className="interaction-fact">
              <span className="metadata-label">Effect on victim drug</span>
              <strong>{formatLabel(interaction.effectOnVictimDrug)}</strong>
            </div>
          )}
        </div>
      )}

      <MetadataList label="Mechanism" values={interaction.mechanism} />
      <MetadataList
        label="Clinical consequences"
        values={interaction.clinicalConsequences}
      />
      <MetadataList label="Recommendations" values={interaction.recommendations} />

      {interaction.evidence && (
        <details className="evidence-disclosure">
          <summary>Read FDA label evidence</summary>
          <p>{interaction.evidence}</p>
        </details>
      )}

      <div className="source-metadata">
        <span>
          Source: {source?.type || "openFDA"}
          {source?.section ? ` · ${formatLabel(source.section)}` : ""}
          {formattedDate ? ` · Effective ${formattedDate}` : ""}
        </span>
        {(source?.labelId || source?.setId) && (
          <details>
            <summary>Source identifiers</summary>
            {source.labelId && <span>Label ID: {source.labelId}</span>}
            {source.setId && <span>Set ID: {source.setId}</span>}
          </details>
        )}
      </div>
      {interaction.severitySource && (
        <p className="severity-disclaimer">
          Severity is an application-derived label classification
          {interaction.severitySource === "APPLICATION_LABEL_RULE"
            ? ", not an FDA-assigned severity rating."
            : ` (${formatLabel(interaction.severitySource)}).`}
          {interaction.severityRule &&
            ` Rule: ${formatLabel(interaction.severityRule)}.`}
        </p>
      )}
    </div>
  );
}

function AlternativeEvidence({ evidence, evidenceCount }) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;

  return (
    <details className="alternative-evidence">
      <summary>
        Additional label evidence
        <span>
          {evidenceCount ?? evidence.length} records
          {evidenceCount > evidence.length ? ` · ${evidence.length} shown` : ""}
        </span>
      </summary>
      <div className="alternative-evidence-list">
        {evidence.map((item, index) => {
          const itemSeverity =
            typeof item.severity === "string"
              ? item.severity
              : item.severity?.value;
          return (
            <article className="alternative-evidence-item" key={`${item.source?.labelId || "evidence"}-${index}`}>
              <div className="alternative-evidence-heading">
                <strong>{item.direction || `${item.interactingDrug || "Drug"} → ${item.victim || "drug"}`}</strong>
                <div>
                  {item.relationship && (
                    <span className="source-tag">{formatLabel(item.relationship)}</span>
                  )}
                  {itemSeverity && (
                    <span className="source-tag">{formatLabel(itemSeverity)}</span>
                  )}
                </div>
              </div>
              {(item.exposureDirection || item.recommendations?.length > 0) && (
                <p className="alternative-evidence-meta">
                  {item.exposureDirection &&
                    `Effect: ${formatLabel(item.exposureDirection)}`}
                  {item.exposureDirection && item.recommendations?.length > 0 && " · "}
                  {item.recommendations?.length > 0 &&
                    `Recommendations: ${item.recommendations.map(formatLabel).join(", ")}`}
                </p>
              )}
              {item.mechanisms?.length > 0 && (
                <MetadataList label="Mechanisms" values={item.mechanisms} />
              )}
              {item.clinicalConsequences?.length > 0 && (
                <MetadataList
                  label="Clinical consequences"
                  values={item.clinicalConsequences}
                />
              )}
              {item.evidence && <p className="alternative-evidence-text">{item.evidence}</p>}
              {item.source && (
                <p className="alternative-evidence-meta">
                  Source: {item.source.type || "openFDA"}
                  {item.source.section ? ` · ${formatLabel(item.source.section)}` : ""}
                  {item.source.effectiveTime
                    ? ` · Effective ${item.source.effectiveTime}`
                    : ""}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}

function InteractionResult({ result }) {
  if (!result) return null;

  if (!result.success) {
    return (
      <section className="result-card result-card--error" aria-live="polite">
        <div className="result-heading">
          <span className="result-icon result-icon--error" aria-hidden="true">
            !
          </span>
          <div>
            <p className="eyebrow">Unable to complete check</p>
            <h2>We couldn&apos;t identify both medications</h2>
          </div>
        </div>
        <p className="result-copy">
          {result.message ||
            "One or more medications could not be identified in the drug database."}
        </p>
        <div className="drug-summaries">
          <DrugSummary drug={result.drug1} number={1} />
          <DrugSummary drug={result.drug2} number={2} />
        </div>
      </section>
    );
  }

  const hasInteraction = result.hasInteraction === true;
  const interaction = result.interaction;
  const evidenceCount = Number.isFinite(result.evidenceCount)
    ? result.evidenceCount
    : null;
  const legacyDetails = Array.isArray(result.interactionDetails)
    ? result.interactionDetails
    : [];

  return (
    <section
      className={`result-card ${hasInteraction ? "result-card--warning" : "result-card--clear"}`}
      aria-live="polite"
    >
      <div className="result-heading">
        <span
          className={`result-icon ${hasInteraction ? "result-icon--warning" : "result-icon--clear"}`}
          aria-hidden="true"
        >
          {hasInteraction ? "!" : "✓"}
        </span>
        <div>
          <p className="eyebrow">
            {result.status
              ? formatLabel(result.status)
              : hasInteraction
                ? "FDA label match found"
                : "No FDA label match found"}
          </p>
          <h2>
            {hasInteraction
              ? "A potential interaction was found"
              : "No specific warning was found"}
          </h2>
        </div>
      </div>

      <div className="drug-summaries">
        <DrugSummary drug={result.drug1} number={1} />
        <DrugSummary drug={result.drug2} number={2} />
      </div>

      {hasInteraction ? (
        <>
          {interaction ? (
            <div className="details-panel">
              <div className="details-title">
                <span>Interaction evidence</span>
                <span className="source-tag">
                  {interaction.source?.type || "FDA label"}
                </span>
              </div>
              <InteractionEvidence interaction={interaction} />
            </div>
          ) : legacyDetails.length > 0 ? (
            <div className="details-panel">
              <div className="details-title">
                <span>Label information</span>
                <span className="source-tag">openFDA</span>
              </div>
              {legacyDetails.map((detail, index) => (
                <p
                  className="interaction-text"
                  key={`${index}-${detail.slice(0, 30)}`}
                >
                  {detail}
                </p>
              ))}
            </div>
          ) : (
            <p className="result-copy">
              An interaction match was reported, but no label evidence was
              included in this response.
            </p>
          )}
          {evidenceCount !== null && (
            <p className="evidence-count">
              {evidenceCount} matching evidence record
              {evidenceCount === 1 ? "" : "s"} reported.
            </p>
          )}
          <AlternativeEvidence
            evidence={result.alternativeEvidence}
            evidenceCount={evidenceCount}
          />
        </>
      ) : (
        <p className="result-copy">
          {result.message ||
            "No interaction evidence was reported for this medication pair."}
        </p>
      )}
      {result.status && (
        <p className="direction-note">
          The result is classified as {formatLabel(result.status)} by the API.
          Label-derived matches are informational and may not capture every
          interaction.
        </p>
      )}
    </section>
  );
}

export default function App() {
  const [drug1, setDrug1] = useState("");
  const [drug2, setDrug2] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function checkInteraction(event) {
    event.preventDefault();
    setResult(null);
    setError("");

    const first = drug1.trim();
    const second = drug2.trim();
    if (!first || !second) {
      setError("Enter both medication names to run a check.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/getMedicineData", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drug1: first, drug2: second }),
      });
      const data = await response.json();

      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || "The check could not be completed.");
      }

      setResult(data);
    } catch (requestError) {
      setError(
        requestError.message ||
          "We couldn’t reach the checker. Make sure the backend is running and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setDrug1("");
    setDrug2("");
    setResult(null);
    setError("");
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="MedCheck home">
          <BrandMark />
          <span>medcheck<span className="brand-period">.</span></span>
        </a>
        <span className="header-caption">
          <span className="live-dot" />
          Medication safety, made clearer
        </span>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow">
              <span className="eyebrow-line" />
              A clearer check-in for your medications
            </p>
            <h1>
              Better informed.
              <br />
              <span>One check at a time.</span>
            </h1>
            <p className="hero-description">
              Look up potential interaction information from FDA drug labels.
              Enter two medications to get started.
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit--outer" />
            <div className="orbit orbit--inner" />
            <div className="art-pill art-pill--one"><span /></div>
            <div className="art-pill art-pill--two"><span /></div>
            <div className="art-spark art-spark--one">✳</div>
            <div className="art-spark art-spark--two">✳</div>
            <div className="art-caption">care, considered</div>
          </div>
        </section>

        <section className="checker-card" aria-labelledby="checker-title">
          <div className="card-topline">
            <div className="section-icon"><MedicineIcon /></div>
            <div>
              <p className="eyebrow">Interaction checker</p>
              <h2 id="checker-title">Which medications?</h2>
            </div>
            <span className="step-indicator"><span /> QUICK CHECK</span>
          </div>

          <form onSubmit={checkInteraction}>
            <div className="medication-fields">
              <label className="input-group" htmlFor="drug-one">
                <span className="input-label"><span>01</span> First medication</span>
                <span className="input-wrap">
                  <MedicineIcon />
                  <input
                    id="drug-one"
                    type="text"
                    value={drug1}
                    onChange={(event) => setDrug1(event.target.value)}
                    placeholder="e.g. Levothyroxine"
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </span>
              </label>
              <div className="field-connector" aria-hidden="true">
                <span>+</span>
              </div>
              <label className="input-group" htmlFor="drug-two">
                <span className="input-label"><span>02</span> Second medication</span>
                <span className="input-wrap">
                  <MedicineIcon />
                  <input
                    id="drug-two"
                    type="text"
                    value={drug2}
                    onChange={(event) => setDrug2(event.target.value)}
                    placeholder="e.g. Calcium Carbonate"
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </span>
              </label>
            </div>

            {error && (
              <p className="form-error" role="alert">
                <span aria-hidden="true">!</span> {error}
              </p>
            )}

            <div className="form-actions">
              <p className="privacy-note">
                <span className="lock-icon" aria-hidden="true">◇</span>
                No account needed. Just the names.
              </p>
              <button className="submit-button" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Checking labels...
                  </>
                ) : (
                  <>
                    Check medications
                    <span aria-hidden="true">↗</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {result && (
          <div className="result-wrap">
            <InteractionResult result={result} />
            <button className="reset-button" type="button" onClick={resetForm}>
              Start a new check <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}

        {!result && !error && (
          <div className="how-it-works">
            <div className="how-item">
              <span className="how-number">01</span>
              <span>Enter two medication names</span>
            </div>
            <span className="how-divider" aria-hidden="true" />
            <div className="how-item">
              <span className="how-number">02</span>
              <span>We look up FDA label information</span>
            </div>
            <span className="how-divider" aria-hidden="true" />
            <div className="how-item">
              <span className="how-number">03</span>
              <span>Review the result with your care team</span>
            </div>
          </div>
        )}

        <aside className="disclaimer">
          <span className="disclaimer-mark" aria-hidden="true">i</span>
          <p>
            <strong>For information only.</strong> This tool searches FDA drug
            label text and may not identify every interaction. A result is not
            medical advice and does not confirm whether a combination is safe.
            Always consult a doctor or pharmacist before changing medication.
          </p>
        </aside>
      </main>

      <footer className="site-footer">
        <span>medcheck<span className="brand-period">.</span></span>
        <span>Medication information, with care.</span>
      </footer>
    </div>
  );
}
