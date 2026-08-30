# Decision status

The complete project decision document supplied on 23 August 2026 is the approved working specification.

## Approved for Phase 1

- Independent private repository
- Next.js 16, React 19, TypeScript, Tailwind CSS and npm
- Node.js `>=22.13.0`
- Local-first processing and protected staging direction
- Automated lint, type-check, unit-test and build gates
- Phase-by-phase review before commits or pushes

## Implemented for Phase 2 review

- Local `.xls` and `.xlsx` MMS workbook processing
- Extension, MIME type, signature, size and schema validation
- Required `Product Log Book` and `Down Time Details` contract with aliases
- Typed production and downtime canonical records with source evidence
- Reported quantity as authoritative, with stroke-multiplier mismatch warnings
- Duplicate, negative, overlap and unreported-downtime flags
- More-than-25% invalid-core-row rejection gate
- Cancellable Web Worker import with progress, JSON and print reports
- Synthetic contract tests plus read-only verification against the supplied MMS sample

Phase 2 was committed as `de01cba` and integrated into `main` at `7e6b87d`.

## Implemented for Phase 3 review

- One-section-at-a-time financial setup with factory/date selection
- Eight financial-master sections covering all requested inputs
- Blank/zero/invalid/estimated/provisional/confirmed distinctions
- Required-input, effective-date overlap/coverage, reference and unit-conversion checks
- Separate consolidated versus itemized machine-rate modes
- Local worker-based Excel/JSON import with preview before replacement
- Excel template, Excel export and lossless JSON draft backup
- Explicit unencrypted local-storage consent, 30-day default expiry, configurable 1–90-day retention, restore and deletion
- MMS item catalog integration without editing production records or inventing financial rates
- Draft revision increments and confirmation reset after rate edits

Phase 3 was committed as `cb367f1` and integrated into `main` at `208e2a6` through PR #2. It does not implement financial calculations or immutable approved policy history (Phase 4). Local named confirmation is self-declared, not an authenticated maker-checker workflow.

## Implemented for Phase 4.1 review

- Strict policy schema covering formula identity/version, inputs/calculation, status, effective dates, approval evidence, confidence rules and history
- Missing-mandatory-input and approval/history consistency checks
- Detached, recursively frozen registry records with exact-version lookup and duplicate rejection
- Domain regression tests, including invalid records, approval evidence, inert expressions and mutation attempts
- Five sequential review/merge checkpoints documented in `PHASE_4_PLAN.md`

Phase 4.1 was committed as `b63639d` and merged into `main` at `cbf47ec`. Registry immutability is in-memory protection, not a durable audit trail.

## Implemented for Phase 4.2 review

- 22 versioned, specification-linked scalar formula definitions with hand-worked tests
- Exact rational arithmetic for decimal strings and JSON-safe intermediate results; no intermediate rounding
- Explicit governance required when creating provisional formula policies; no active factory policies seeded
- Strict policy-to-implementation binding and single-policy business-date bounds
- Input units, source/category, scope, completeness, confirmation and missing-data checks
- Separate consolidated/itemized costs, quality attribution, operational profit, opportunity and scenarios
- Provisional-policy opt-in, traceable input/result evidence and unavailable results for invalid calculations

Phase 4.2 remains uncommitted for review. All new financial formulas require business review; passing tests is not 3D approval. The catalog does not establish factory-wide cost completeness or deduplication. Date-based policy selection, snapshots, confidence scoring and UI remain in 4.3–4.5; actual historical financial aggregation belongs to subsequent engine phases. See `FORMULA_REFERENCE.md` for explicit implemented/deferred boundaries.

## Provisional financial policies

The following must stay configurable and must not be described as 3D-confirmed:

- Machine-hour cost composition
- Labour cost per operator per shift
- Rejection cost when the rejection stage is unknown
- Incremental rework cost composition
- Product-specific scrap recovery per unit
- Forecast WAPE target
- Thirty-day post-handover support period

## Acceptance dependencies

Final acceptance still requires named 3D MMS technical and financial/business approvers, selected-case financial verification and written approval of provisional formulas.
