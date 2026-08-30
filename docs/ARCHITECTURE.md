# Architecture

## Direction

3D Profit Intelligence uses Next.js 16 App Router, React 19, TypeScript and Tailwind CSS. Historical workbook processing, filtering and exports are intended to remain client-side by default.

The user interface must depend on typed calculation results. Calculation engines must never depend on React components.

```text
Workbook parser
  -> canonical production and downtime records
  -> versioned financial master and policy
  -> revenue, cost, loss and profit engines
  -> forecast and recommendation engines
  -> one filtered analytics result
  -> dashboard and reports
```

## Phase 2 importer

The browser transfers the selected workbook buffer to a dedicated Web Worker. The worker validates the file envelope and MMS contract, parses saved workbook values, creates canonical production and downtime records, and returns a compact review summary to the interface.

The canonical model preserves the source sheet and one-based source row on every record. Exact duplicates and negative values remain available as evidence but are excluded from ordinary totals. Reported `Qty` is authoritative; `Stroke × M. Factor` is a validation comparison only.

The worker retains the complete canonical import in memory for future calculation phases. Cancelling or replacing an import terminates that worker and releases its local state.

## Planned source boundaries

### Phase 3 implementation

- `src/features/workflow/analysis-workspace.tsx` keeps Import and Financial Setup mounted, showing only the active step. Switching steps preserves the in-memory draft and live MMS worker.
- `src/core/financial/schema.ts` defines schema version 1 and the eight section contracts. The same field definitions drive forms, validation and Excel headers.
- `src/core/financial/validation.ts` checks business inputs independently of React. Missing inputs, invalid/conflicting inputs and warnings remain distinct.
- `src/core/financial/portability.ts` validates JSON shape and Excel structure, uses saved formula values only, and escapes formula-like exported text. Financial imports are capped at 10 MB / 10,000 rows.
- `src/workers/financial-master.worker.ts` parses imported financial masters off the UI thread. The UI previews a replacement before applying it.
- `src/core/financial/draft-storage.ts` owns the single namespaced local-storage entry. Consent is required for writes; expiry is anchored to consent time, not extended silently on every save.
- The wizard keeps raw form input strings so empty, zero and invalid drafts can round-trip. Numeric Excel values are typed when valid; JSON preserves exact draft text. Later financial engines must validate and resolve inputs before using them.
- The master carries a draft ID/revision. Immutable approved master/policy snapshots and downstream calculation fingerprints belong to the next phases.

No React component calculates revenue or profit. The setup review is not an approval of financial accuracy.

### Phase 4.1 implementation

- `src/core/policy/schema.ts` defines a strict serializable policy contract, separate from financial-master drafts. Expressions are descriptive text, never evaluated code.
- `src/core/policy/registry.ts` constructs a detached, deeply read-only catalog with exact policy-ID/version lookup. Unknown versions remain unavailable; duplicate references are rejected.
- The catalog currently has no persistence or UI wiring. Cross-version validity, executable formula binding, financial-master snapshots and confidence evaluation follow the review gates in `docs/PHASE_4_PLAN.md`.
- Self-declared approval evidence is structurally validated, not authenticated. No default financial policy is promoted to confirmed.

### Phase 4.2 implementation

- `src/core/policy/formulas.ts` holds 22 versioned definitions and fixed-code scalar implementations; callers cannot execute arbitrary formula text.
- `src/core/policy/exact.ts` carries exact fractions between steps and formats only at the final display boundary. Public values use numerator/denominator strings so JSON serialization does not lose precision.
- `src/core/policy/evaluate.ts` binds policy metadata to known implementations and validates explicit dates, scope, unit/source/category evidence and mandatory inputs. Results include explanations, input references, warnings and unavailable reasons.
- Formula policies require caller-provided governance and start provisional. No active dates, confidence scores, financial inputs or approvers are supplied by default.
- This is a standalone core API, not dashboard integration or a full ledger. Future engines must resolve aliases/conversions, select source quantities and master versions, prove cost coverage, allocate shared costs and prevent cross-record double counting. See `docs/FORMULA_REFERENCE.md`.

- `src/app`: routes, layouts and route-specific presentation
- `src/components`: reusable UI components
- `src/features`: user workflows such as import and financial setup
- `src/core`: framework-independent domain types and calculation engines
- `src/workers`: cancellable workbook parsing and future heavy calculation workers
- `src/lib`: cross-cutting utilities and adapters

## Non-negotiable boundaries

- Preserve source sheet and row evidence through normalization.
- Never mutate the uploaded workbook.
- Reject major structural incompatibilities instead of guessing.
- Keep actual, estimated and opportunity categories separate.
- Resolve double-counting through a causal loss ledger.
- Recalculate all downstream views from the same filtered analytics result.
- Cache only against explicit source, policy and configuration fingerprints.

## Deployment direction

The application must support local laptop use, protected Vercel staging and a future offline-capable company deployment. Advanced Python forecasting and server persistence are postponed beyond the MVP.
