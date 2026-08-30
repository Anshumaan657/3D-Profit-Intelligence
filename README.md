# 3D Profit Intelligence

**Factory Profit, Loss and Forecast Dashboard**

3D Profit Intelligence is a local-first web application that will translate MMS production workbooks into traceable operational financial performance for factory owners and business teams.

## Current checkpoint

Phase 3 adds a guided Financial Setup Wizard on top of the verified MMS importer. It collects product prices/material costs, machine and labour rates, overheads, quality/rework costs, scrap recovery, factory calendar rules, unit conversions and aliases. Effective-date and input checks are shared by the UI and Excel/JSON imports. Draft storage is local, optional and consent-based. Financial calculations remain deferred to their reviewed phase.

Phases 3 and 4.1 are merged. Phase 4.2 adds 22 versioned formula definitions, exact arithmetic, guarded policy execution and worked-case tests for review. The dashboard remains unchanged; historical financial engines are not yet integrated. Phase 4 is split into five separately reviewed and merged subphases; see the plan below.

## Financial integrity rules

- Actual accounting results, estimated operational results and opportunity losses remain separate.
- Missing mandatory amounts are never silently replaced with zero.
- Opportunity losses are not automatically deducted from operating profit.
- Every future amount must retain source evidence and its financial-policy version.
- Provisional formulas must remain configurable and visibly provisional.

## Local development

Requirements:

- Node.js 22 LTS (`>=22.13.0`)
- npm

Install and validate:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Start the local application:

```bash
npm run dev
```

## Data safety

Do not add client workbooks, normalized snapshots, generated reports, secrets or screenshots containing factory information to this repository. The relevant paths and spreadsheet extensions are excluded through `.gitignore`.

The importer does not upload or modify the selected workbook. It rejects unsupported formats, unsafe sizes, mismatched file signatures, missing structural requirements and imports with more than 25% invalid core rows.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Excel input guide](docs/EXCEL_INPUT_GUIDE.md)
- [Financial setup guide](docs/FINANCIAL_SETUP.md)
- [Phase 3 verification and review](docs/PHASE_3_REVIEW.md)
- [Phase 4 subphase plan and GitHub workflow](docs/PHASE_4_PLAN.md)
- [Phase 4.1 verification and review](docs/PHASE_4_1_REVIEW.md)
- [Formula definitions and execution boundaries](docs/FORMULA_REFERENCE.md)
- [Phase 4.2 verification and GitHub PR workflow](docs/PHASE_4_2_REVIEW.md)
- [Development workflow](docs/DEVELOPMENT.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Decision status](docs/DECISION_STATUS.md)

## Project status

This repository is proprietary and has no public license. Do not publish, commit or push changes without explicit phase authorization.
