# AGENTS.md

## What this is

Single-package Node.js (Express 5) backend in `Backend/`. No frontend, no monorepo, no CI, no database, no tests.
Resolves drug names via RxNorm, then queries openFDA drug labels for interaction warnings. Both APIs are public (no keys) but require network access at runtime.

- Entry point: `Backend/index.js`
- Route: `Backend/routes/medicineData.js` → `GET /getMedicineData`
- All logic (~115 lines): `Backend/controller/fetchDrug.js`
- `Backend/models/` is an empty, unused placeholder.
- `APIResponse.txt` (repo root) is a real sample response and matches the current contract — use it to verify response-shape changes.

## Commands

Run everything from `Backend/` (dotenv resolves `.env` relative to cwd; running from the repo root silently loses `PORT`).

- Start server: `node index.js` (there is no `start` script)
- Watch mode: `npx nodemon index.js` (nodemon is a dependency but has no script)
- `npm test` intentionally exits 1 — there are no tests, linters, formatters, or typecheckers. Don't invent verification commands that don't exist.

`Backend/.env` must define `PORT` (its only key).

## API contract (easy to get wrong)

`GET /getMedicineData` takes input in a **JSON body**, not query params: `{"drug1": "...", "drug2": "..."}`.
`express.json()` is registered globally, so a GET with a JSON body works; a bodyless GET gets 400.

Response shapes (verified against `fetchDrug.js` and `APIResponse.txt`):

- 400 `{error}` — `drug1` or `drug2` missing from body
- 404 `{success: false, message, drug1, drug2}` — a drug failed RxNorm resolution. **Network/API errors during resolution are also reported here** (the catch sets `found: false`), so 404 does not always mean "unknown drug".
- 200 `{success: true, drug1, drug2, hasInteraction: true, interactionDetails}` — openFDA returned a label match; `interactionDetails` is the raw FDA `drug_interactions` text array.
- 200 `{success: true, ..., hasInteraction: false, message}` — openFDA returned 404 (no match). Note `success: true` here.
- 500 `{error}` — anything else failed.

There is **no** `status` field, no severity scoring, and no 503 path. Do not add one-shaped responses without updating `APIResponse.txt`.

## Behavior quirks

- The openFDA check is **one-directional**: it searches drug1's label text for drug2 only (`openfda.generic_name:"drug1" AND drug_interactions:"drug2"`), and only inspects `results[0]`. Order the pair accordingly if testing.
- `resolveDrug` takes the *first* RxNorm concept group with an RxCUI (any TTY, not necessarily an ingredient) and its first `tty=IN` ingredient as `generic`.
- `hasInteraction` reflects a single label match, not a curated interaction database. Don't present it as authoritative.

## Conventions

- ESM only (`"type": "module"`). Use `import` and include the `.js` extension in relative imports.
- Keep the code plain axios + Express — no framework additions without an explicit request.

## Git gotchas

There is **no `.gitignore`**. `Backend/` (including `node_modules/` and `.env`) is untracked, as is `APIResponse.txt`. Never run a blanket `git add .` — stage explicit paths.
