# Phase 4.2 — Formula reference

This is a code-reviewed implementation reference, **not written 3D business approval**. All policies created by the supplied factory function start provisional. The catalog itself contains definitions, not active dated policies. Nothing is automatically added to a factory's configuration or dashboard.

## Specification authority

The project-owner-supplied **3D Profit Intelligence — Complete Project Decisions** is authoritative. The decision numbers below refer to that document. The earlier 3D application's `docs/FORMULAS_AND_POLICIES.md` and `app/calculation-policy.ts` were inspected as historical references. This project's newer rules take precedence:

- Decisions 49–50: reported quantity is authoritative, and good quantity is `max(0, reported − rejected − rework)`; scrap is not deducted here.
- Decisions 58–59: do not carry over the older app's six-decimal intermediate rounding.
- Decisions 77–84: machine-hour impact is opportunity, not an automatically incurred operating expense. Unclassified System Off must not become monetary loss automatically.
- Decisions 185 and final execution direction: implementation and passing tests do not confer business confirmation.

## Catalog and hand-worked verification cases

Every definition below is version `1.0.0`; implementation ID is `<policy-id>-v1`. Rates and amounts are INR, durations are seconds, quantities use an explicit resolved unit. Examples are synthetic and are not factory defaults. The test suite verifies **exact**, not rounded, results.

| Policy ID | Calculation | Synthetic case → exact result | Authority |
| --- | --- | --- | --- |
| `good-quantity` | max(0, reported − rejected − rework) | 200.5 − 2 − 1.25 → 197.25 units | 49–50 |
| `net-selling-price` | selling price × (1 − discount% / 100) | 125.50 × 0.90 → 112.95/unit | 57–59; Phase 3 discount field |
| `production-value` | good quantity × net price | 197.25 × 112.95 → 22,279.3875 | 4, 49–59 |
| `material-cost` | reported quantity × material/unit | 200.5 × 40 → 8,020 | 50, 63, 78; provisional gross-production basis |
| `machine-cost-consolidated` | running seconds / 3600 × rate | 5400 / 3600 × 120 → 180 | 64, 71, 73 |
| `machine-cost-itemized` | running hours × (base + electricity + maintenance + tooling) | 1.5 × (80 + 20 + 15 + 5) → 180 | 64; Phase 3 rate modes |
| `labour-operator-shift` | paid seconds / standard paid shift seconds × shift rate | 14400 / 28800 × 800 → 400 | 65–69, 71 |
| `labour-operator-hour` | paid hours × operator-hour rate | 1.5 × 100 → 150 | 65–69 |
| `labour-machine-hour` | paid hours × machine-hour labour rate | 1.5 × 60 → 90 | 65–69 |
| `overtime-cost` | overtime hours × base rate × full multiplier | 2 × 100 × 1.5 → 300 | 67 |
| `period-allocation` | fixed period cost × explicit share | 31000 × 0.25 → 7,750 | 65, 69–71; Phase 3 overheads |
| `gross-rejection-cost` | rejected quantity × accrued cost/unit | 5 × 60 → 300 | 77–81 |
| `scrap-recovery` | scrap quantity × confirmed recovery/unit | 5 × 4 → 20 | 78, 80–81 |
| `net-rejection-loss` | gross rejection − confirmed scrap recovery | 300 − 20 → 280 | 78, 81 |
| `incremental-rework-cost` | rework quantity × incremental cost/unit | 3 × 12.5 → 37.5 | 77, 79 |
| `contribution-margin` | net price − avoidable variable cost/unit | 100 − 65 → 35/unit | 83 |
| `machine-hour-opportunity` | classified lost seconds / 3600 × hourly rate | 1800 / 3600 × 120 → 60 | 77, 82 |
| `shortfall-opportunity` | min(lost good units, confirmed unfulfilled demand) × max(0, contribution/unit) | min(100, 30) × 35 → 1,050 | 83–85; non-positive-contribution guard provisional |
| `recoverable-opportunity` | gross opportunity × confirmed cause-specific recovery% / 100 | 1050 × 40 / 100 → 420 | 89–90 |
| `operating-profit` | estimated production value − complete operating cost | 1000 − 1200 → −200 | 4, 52–54, 63, 76–77 |
| `profit-margin` | estimated operating profit / production value × 100 | −200 / 1000 × 100 → −20% | 112; conventional ratio pending business review |
| `potential-profit` | operating profit + approved recoverable opportunity | −200 + 420 → 220 (scenario only) | 93 |

## Exact precision and display

`src/core/policy/exact.ts` uses reduced BigInt fractions. Plain decimal strings are converted exactly. For example, a one-second cost at INR 1/hour remains `{ numerator: "1", denominator: "3600" }`, not an approximate float. Results can be passed as these JSON-safe fractions to subsequent formulas without losing precision.

Raw decimal strings allow at most 100 digits; normalized intermediate numerators/denominators allow at most 1,000 digits. Unsupported input, zero division and excessive growth are explicit failures, not zero. This bounds this scalar API; it is not a completed large-workbook performance benchmark. Existing MMS numeric parsing cannot recover precision already lost in source cells or normalization; future adapters must not claim otherwise.

`Exact.format(places)` is display-only, defaults to two decimal places and rounds halfway values away from zero. This is an explicit provisional presentation convention to review, not an assertion of accounting regulation. Do not feed formatted strings back into calculations or round each row before summing. The arithmetic tests include signed half-cent cases, large integers and repeating fractions.

## Input contracts and execution

Public exports are in `src/core/policy/index.ts`:

1. `listFormulaDefinitions` / `findFormulaDefinition` return detached catalog metadata for exact versions.
2. `createProvisionalFormulaPolicy` requires explicit effective dates, creation identity/time/reason and confidence rules. It does not infer dates, install a global cap, authenticate an approver or publish a policy.
3. `evaluatePolicy(policy, request)` validates the full Phase 4.1 record, binds it to the exact implemented contract, checks the supplied business date and executes only known code. Altering expressions, names, input definitions, category, guards or implementation IDs fails binding. Text is never evaluated.
4. Each request explicitly supplies business date, scope ID, resolved quantity unit, provisional opt-in and input evidence. Each input carries an exact amount, matching scope ID, unit, source, financial category, evidence status, completeness and source references.
5. Results carry exact value or unavailable, policy/version/status, input evidence, business date/scope, expression, explanation, decision references, issues and warnings. Confidence is explicitly `not_evaluated`, not an invented score.

`{unit}` in definition metadata is substituted consistently with the request's resolved unit (for example, `piece`, `kg` or `box`). `piece` and `kg` never match automatically. Approved conversion selection/execution and alias matching belong to the downstream master-resolution workflow. A scope ID must identify the relevant product/assignment/analysis slice; simply labelling mismatched data with the same ID does not make it valid.

Unknown or additional inputs fail closed: passing a separate electricity amount to the consolidated machine formula, or extra opportunity loss to operating profit, does not silently add or ignore it. Alternate methods are separate formulas. Mandatory inputs are required even when another input is zero. Negative ordinary production quantities are rejected; negative contribution/profit are retained. Demand, scrap recovery and recoverability require the specified confirmed evidence.

Hard unavailability rules for known missing/estimated/provisional conditions are honoured. Hard source-quality, mapping-quality or formula-reliability conditions block calculation until the corresponding checks exist. Numerical confidence caps and four-level confidence labels remain for 4.4; returning a value does not imply high confidence or readiness for financial publication.

## Guardrails versus downstream responsibilities

Implemented checks prevent category/unit/scope mismatches, partial inputs, unknown inputs, policy-code drift and missing mandatory amounts. They **cannot prove supplied source references or completeness assertions are truthful**. The later engines must establish these facts from the source/master data:

- Determine complete cost coverage, deduplicate costs and allocate shared labour/overheads against the actual factory calendar. `period-allocation` evaluates an explicit share; it does not decide that share.
- Prevent the same maintenance provision and actual expenditure, quality attribution and original costs, or alternate labour/machine methods appearing twice in a ledger. Phase 4.2 is not the complete causal loss ledger.
- Resolve financial eligibility in the approved order (invoice, dispatch, good, reported only with unavailable quality). `production-value` implements the **good-production branch only**; it never relabels invoice quantities as production or actual revenue. Other branches and unknown-quality fallback must be explicit in later engines, with their own date/evidence treatment.
- Keep gross rejection attribution independent when recovery is unknown. It is not an extra deduction on top of accrued manufacturing cost. Negative net rejection attribution is preserved with a warning for review.
- Resolve downtime overlaps and classify System Off before valuing capacity. Without confirmed unfulfilled demand, demand-constrained opportunity is unavailable; a historical-baseline estimated-opportunity branch is future work.
- Preserve input/source/policy/master snapshots across runs and select versions by date (4.3). This phase checks a single explicitly selected policy's date bounds only.
- Perform authenticated maker-checker approval in the later multi-user system. Evidence here is self-declared.

Actual accounting profit, invoice/dispatch integration, historical aggregation, recommendations and forecasting are not delivered by this catalog. No user interface or uploaded source data changed in 4.2.
