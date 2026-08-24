# 3D Profit Intelligence

**Factory Profit, Loss and Forecast Dashboard**

3D Profit Intelligence is a local-first web application that will translate MMS production workbooks into traceable operational financial performance for factory owners and business teams.

## Current checkpoint

Phase 2 adds the generalized, local-only MMS workbook importer. It validates `.xls` and `.xlsx` files, maps the required MMS sheets and columns, normalizes production and downtime evidence in a Web Worker, and produces a printable or downloadable compatibility report. Financial calculations remain deferred to their reviewed phase.

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
- [Development workflow](docs/DEVELOPMENT.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Decision status](docs/DECISION_STATUS.md)

## Project status

This repository is proprietary and has no public license. Do not publish, commit or push changes without explicit phase authorization.
