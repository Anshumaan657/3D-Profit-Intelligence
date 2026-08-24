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

Phase 2 changes remain uncommitted and unpushed until project-owner review.

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
