# Phase 4.2 — Formula definitions and calculation tests

Date: 30 August 2026. Baseline: `cbf47ec` (merged Phase 4.1). Branch: `feat/policy-formulas`. Status: implemented and verified locally, uncommitted for owner review.

## Delivered

- 22 exact-version scalar formula definitions, linked to approved specification decisions and explicitly provisional where business review is outstanding
- Exact decimal/rational arithmetic, JSON-safe intermediate values and display-only rounding
- Strict binding of policy metadata to fixed-code implementations; no arbitrary formula-text execution
- Explicit governance when creating provisional policy records; no invented effective dates, approvers, factory values or confidence thresholds
- Input scope, units, sources/categories, evidence references, completeness, confirmation, range and missing-data checks
- Separate operating results, quality attribution, opportunity and scenario categories
- Traceable results with exact values, reasons, warnings and explicit unavailability
- 120 new tests, including a worked numerical case and missing-input regression for every formula

Read `FORMULA_REFERENCE.md` for the formula table, synthetic worked examples, provisional interpretations and downstream responsibilities. No dashboard changes, new dependencies, accounting integration, cloud/storage changes or Phase 4.3 work are included.

## Verification

Runtime: Node.js `22.19.0`, matching the successful owner run for 4.1. The owner's ordinary shell selects Node 26 first; use the scoped PATH commands below.

| Check | Result |
| --- | --- |
| Lint | Passed |
| TypeScript | Passed |
| Default full test suite | 237 passed; 1 optional real-workbook test skipped; 7 files passed |
| Full suite with the real MMS sample and `--testTimeout=30000` | 238 passed; none skipped; 7 files passed |
| Production build | Passed, including static page generation |
| `git diff --check` | Passed |
| Scope/safety inspection | No executable expressions, network calls, browser storage calls, raw-data logging, dependency changes or UI changes added |

The first real-sample run, executed concurrently with the production build, exceeded the existing 5-second test timeout (about 5.5 seconds). The other 237 tests passed. The serial rerun used a 30-second timeout and all 238 passed. No assertions or importer code were altered. This is not a claim that 50 MB import performance has been certified.

No new browser session was required for this domain-only change. Existing wizard/importer component tests and production build were rerun. Cross-browser, accessibility and formal security certification remain separate acceptance work.

## Important review boundaries

- These tests establish implementation behaviour, not written 3D financial acceptance.
- Exact fractions avoid intermediate numeric rounding; they cannot recover precision lost before inputs reach the formula API.
- Halfway display rounding away from zero, gross-production material basis, conventional profit margin and the non-positive-contribution opportunity guard are explicit provisional choices to review.
- Policies and input evidence can be self-declared. This is not authenticated maker-checker or tamper-proof provenance.
- Inputs marked partial are blocked, but truthful completeness, actual cost coverage, ledger deduplication, shared-operator assignments, calendars, quantity eligibility selection and approved unit conversions must be established by later engines.
- This version implements the good-production branch of production value, not invoice/dispatch accounting or automatic reported-quantity fallback.
- Published snapshots and cross-version date selection belong to 4.3; numeric confidence scoring/UI to 4.4; full policy portability to 4.5.

## Review and commit commands

```bash
cd "/Users/anshumaansharma0404gmail.com/Desktop/3D-Profit-Intelligence"
git switch feat/policy-formulas
git status --short
(
  export PATH="/usr/local/bin:$PATH"
  node --version
  npm run lint && npm run typecheck && npm test && npm run build
)
git diff --check
```

Optional real-workbook regression (local file only, never stage the workbook):

```bash
(
  export PATH="/usr/local/bin:$PATH"
  MMS_SAMPLE_PATH="/Users/anshumaansharma0404gmail.com/Desktop/3D/Sample1_31-07-23_To_25-12-24.xls" npm test -- --testTimeout=30000
)
```

After all checks pass and you approve the source changes:

```bash
git add src/core/policy README.md docs/ARCHITECTURE.md docs/DECISION_STATUS.md docs/PHASE_4_PLAN.md docs/FORMULA_REFERENCE.md docs/PHASE_4_2_REVIEW.md
git diff --cached --stat
git diff --cached
git commit -m "feat: add versioned financial formulas and exact calculation tests"
git push -u origin feat/policy-formulas
```

## GitHub website PR

Open [the Phase 4.2 comparison](https://github.com/Anshumaan657/3D-Profit-Intelligence/compare/main...feat/policy-formulas). Confirm **base: main**, **compare: feat/policy-formulas**.

Title:

```text
Phase 4.2 — Financial formulas and exact calculation tests
```

Description:

```markdown
## Summary
Adds 22 versioned scalar financial formulas with exact arithmetic and strict policy binding. No dashboard changes or active factory policies are introduced.

## Changes
- Add specification-linked formula definitions and worked numerical cases.
- Preserve exact decimal/fraction values between calculations; round only for display.
- Validate policy versions, dates, input scope/units/sources, completeness and required confirmations.
- Reject missing inputs and keep operating results, quality attribution, opportunity and scenarios separate.
- Return traceable results with unavailable reasons and provisional warnings.
- Add 120 tests and formula/review documentation.

## Verification
- Node 22.19.0: lint, TypeScript and production build passed.
- Default suite: 237 passed, 1 optional real-workbook test skipped.
- Real-workbook suite: 238 passed with a 30-second test timeout.
- An initial concurrent real-workbook run hit the existing 5-second timeout; the serial rerun passed without changing assertions.

## Boundaries
Business approval remains pending. Factory-wide allocations/deduplication, accounting integration, published snapshots, confidence scoring and UI integration are not included. Approval evidence remains self-declared.
```

Create the PR, review **Files changed**, and wait for GitHub checks. Then choose **Create a merge commit → Merge pull request → Confirm merge** on the website. Do not push directly to `main` or merge with CLI.

After GitHub confirms the merge:

```bash
git switch main
git pull --ff-only origin main
git status
```

Confirm completion before starting 4.3. No commit, push, PR creation, merge or deployment was performed during this implementation.
