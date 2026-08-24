# Development workflow

## Phase checkpoints

Implement one approved phase at a time. At the end of a phase:

1. Run linting, type checks, unit tests and the production build.
2. Record implemented scope, validation results and known limitations.
3. Wait for project-owner review.
4. Commit or push only after explicit authorization.

## Branch direction

The planned feature checkpoints are:

- `feat/financial-foundation`
- `feat/historical-profit-engine`
- `feat/owner-dashboard-reporting`
- `feat/profit-forecasting`
- `test/final-financial-verification`

## Formula changes

Every financial formula must declare its name, version, status, description, required inputs, effective date and approval state. A provisional formula cannot silently become confirmed.

## Source data

Never copy client workbooks into the repository. Use external local paths for manual development and sanitized synthetic fixtures for automated tests.
