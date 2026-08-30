# Phase 4 — Versioned Financial Policy

Phase 4 has five separately reviewed subphases. The owner initially required a merge checkpoint between each. After merging 4.2, the owner authorized completing 4.3–4.5 continuously with three separate local commits and stacked branches. Pushes and merges remain owner-controlled through GitHub; do not push directly to `main`. This subdivision does not change the remaining major project phases.

Current checkpoint: 4.2 merged at `9945b32`; 4.3–4.5 implemented and locally committed on stacked branches. See `PHASE_4_STACKED_PRS.md` for the current review/push/merge instructions. The 4.1 commands below are retained as historical workflow, not the current branch instructions.

| Subphase | Scope | Acceptance checkpoint |
| --- | --- | --- |
| 4.1 — Policy foundation | Serializable policy contract, strict validation, exact-version read-only registry, domain tests | Every policy records the required metadata; malformed records and duplicate versions are rejected. No UI change. |
| 4.2 — Formula definitions | Reviewed formula catalog and code implementations, input/unit contracts, missing-data and zero handling, guardrails against double counting, selected-case tests | Each implemented formula has traceable specification evidence and worked cases. Unapproved financial formulas remain provisional. No arbitrary expression execution. |
| 4.3 — Versions and approvals | Immutable published policy and financial-master snapshots, explicit version creation and approval records, effective-date resolution, overlaps/gaps, pinned historical references | Edits create new versions; historical references remain stable. Local approval is self-declared, not authenticated maker-checker. Retrospective recalculation is explicit. |
| 4.4 — Confidence and integration | Per-result confidence evaluation, critical-component caps, four-level labels and evidence score, setup integration, small policy list/details/history interface | Missing mandatory inputs make dependent results unavailable; provisional evidence visibly limits confidence. Threshold choices stay provisional until reviewed. Main dashboard remains simple. |
| 4.5 — Portability and final verification | Version-preserving backup/restore, consent-aware retention and deletion, end-to-end workflow and regression tests, administrator/review documentation | Restoring history cannot silently overwrite versions; verify the entire implemented application and document remaining acceptance dependencies. |

## Boundaries

- Policy formulas support later engines; Phase 4 does not deliver the entire historical profit engine, forecasts or accounting integration.
- Keep actual accounting, estimated operational, opportunity and scenario outputs distinct.
- Use full calculation precision, rounding only for display. Numerical implementation choices and worked-case precision tests belong to 4.2.
- Every policy version records formula identity, inputs/calculation, dates, provisional/confirmed status, approval information, confidence rules and change history.
- No invented approvers, effective dates, financial rates or approved confidence thresholds. Synthetic test fixtures are not production defaults.
- Immutable in-memory objects alone are not durable audit history, authenticated approval or tamper-proof storage.

## Phase 4.1 implementation

`src/core/policy/schema.ts` defines the schema-version-1 contract and exports its inferred TypeScript types. Inputs record names, units, source category and missing-data behaviour. Calculation metadata includes an implementation identifier, explanatory expression, output unit, guards and display-only rounding. Expression text is inert; this module never evaluates it. An implementation identifier is not yet verified against executable code (4.2).

Dates are real ISO calendar dates, inclusive, with an explicit `null` open end. Formula versions use numeric `major.minor.patch` strings. The schema checks within-record date ordering; cross-version date resolution and lineage are deliberately deferred to 4.3.

Confirmed status requires an approval name, UTC timestamp, reason, evidence reference and matching final approval-history event. All approval identities are explicitly self-declared. This validates the record's consistency, not the identity, authenticity of evidence, or authorization of the approver. The history is supplied data at this stage; the controlled version-creation workflow comes in 4.3.

Confidence rules describe conditions and an unavailable/cap effect. Scores are evidence, not probability. Missing mandatory inputs cannot be converted into mere score penalties. No business score thresholds are seeded or evaluated in 4.1.

`src/core/policy/registry.ts` validates and copies records, rejects duplicate policy-ID/version pairs, and recursively freezes its returned records/lists. `get` requires an exact policy reference and returns `undefined` when absent. There is no latest-version fallback, modification API, automatic default catalog, browser storage, network operation or UI dependency. A registry represents one supplied catalog; factory scoping and published-snapshot integration are not implemented here.

## Review and GitHub merge workflow

Phase 4.1 branch: `feat/policy-foundation`. Review all changes before staging. Do not include client data, exports or secrets.

```bash
cd "/Users/anshumaansharma0404gmail.com/Desktop/3D-Profit-Intelligence"
git switch feat/policy-foundation
git status --short
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
git add src/core/policy README.md docs/ARCHITECTURE.md docs/DECISION_STATUS.md docs/PHASE_4_PLAN.md docs/PHASE_4_1_REVIEW.md
git diff --cached --stat
git diff --cached
git commit -m "feat: add versioned financial policy foundation"
git push -u origin feat/policy-foundation
```

Only commit/push after the checks pass and the staged changes match your review.

Open [the GitHub comparison](https://github.com/Anshumaan657/3D-Profit-Intelligence/compare/main...feat/policy-foundation). Set **base: main**, **compare: feat/policy-foundation**. Create the PR with title **Phase 4.1 — Financial policy foundation**, review **Files changed**, and wait for CI checks to pass. Use **Create a merge commit → Merge pull request → Confirm merge** on the website. No CLI merge or direct push to main is required.

After GitHub confirms the merge:

```bash
git switch main
git pull --ff-only origin main
git status
```

Confirm completion to begin 4.2. Do not start 4.2 on the 4.1 review branch.
