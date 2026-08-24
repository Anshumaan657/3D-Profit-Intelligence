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
