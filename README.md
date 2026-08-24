# 3D Profit Intelligence

**Factory Profit, Loss and Forecast Dashboard**

3D Profit Intelligence is a local-first web application that will translate MMS production workbooks into traceable operational financial performance for factory owners and business teams.

## Current checkpoint

Phase 1 establishes the independent repository, application shell, security boundaries, documentation, automated checks and test foundation. Workbook importing and financial calculations are intentionally deferred to later reviewed phases.

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

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development workflow](docs/DEVELOPMENT.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Decision status](docs/DECISION_STATUS.md)

## Project status

This repository is proprietary and has no public license. Do not publish, commit or push changes without explicit phase authorization.
