# Phase 4.3–4.5 — Local commits and GitHub PR handoff

The project owner authorized one continuous implementation with three **local commits**, leaving all pushes, PR creation and merges to the owner. Do not create duplicate commits: these checkpoints are already committed locally. Local `main` remains at the merged Phase 4.2 baseline `9945b32` until the GitHub merges are pulled.

| Checkpoint | Branch | Initial PR base |
| --- | --- | --- |
| 4.3 — Releases and approvals | `feat/policy-versioning` | `main` |
| 4.4 — Confidence and interface | `feat/policy-confidence` | `feat/policy-versioning` |
| 4.5 — Portability and verification | `feat/policy-portability` | `feat/policy-confidence` |

## Verify the combined work

```bash
cd "/Users/anshumaansharma0404gmail.com/Desktop/3D-Profit-Intelligence"
git switch feat/policy-portability
git status
git log --oneline main..HEAD
(
  export PATH="/usr/local/bin:$PATH"
  node --version
  npm run lint && npm run typecheck && npm test && npm run build
)
```

Optional sample regression:

```bash
(
  export PATH="/usr/local/bin:$PATH"
  MMS_SAMPLE_PATH="/Users/anshumaansharma0404gmail.com/Desktop/3D/Sample1_31-07-23_To_25-12-24.xls" npm test -- --testTimeout=30000
)
```

Review each checkpoint without switching branches:

```bash
git diff main...feat/policy-versioning
git diff feat/policy-versioning...feat/policy-confidence
git diff feat/policy-confidence...feat/policy-portability
```

Press `q` to leave Git's diff viewer. After your review, push the branches in order:

```bash
git push -u origin feat/policy-versioning
git push -u origin feat/policy-confidence
git push -u origin feat/policy-portability
```

## PR 1 — Phase 4.3

[Create comparison](https://github.com/Anshumaan657/3D-Profit-Intelligence/compare/main...feat/policy-versioning)

Title: **Phase 4.3 — Immutable financial releases and approvals**

```markdown
## Summary
Adds immutable financial-master and policy releases with separate release revisions and executable formula versions.

## Changes
- Capture master snapshots and effective-dated policy schedules.
- Validate date overlaps, return explicit gaps and retain parent-linked history.
- Record self-declared approvals without editing previous releases.
- Pin calculation input/result evidence to exact release and source fingerprints.
- Verify hashes and reproduce historical calculations.

## Verification
Lint, TypeScript and production build passed on Node 22.19.0.
245 tests passed; one optional real-workbook test skipped.

## Boundaries
No persistence/UI yet. Hashes are not authenticated signatures; approval is self-declared.
```

Base **main**, compare **feat/policy-versioning**. Review, wait for CI and use **Create a merge commit → Merge pull request → Confirm merge** on GitHub.

## PR 2 — Phase 4.4

[Initial stacked comparison](https://github.com/Anshumaan657/3D-Profit-Intelligence/compare/feat/policy-versioning...feat/policy-confidence)

Title: **Phase 4.4 — Evidence confidence and policy review workspace**

```markdown
## Summary
Adds per-result confidence evaluation and a secondary Policies & history workspace, integrated with Financial Setup.

## Changes
- Apply weakest-component and provisional/input confidence caps.
- Require evidence-backed assessments and versioned label thresholds.
- Return unavailable confidence for missing evidence or mandatory inputs.
- Create/revise provisional policies and record approval in new releases.
- Inspect formula details, date coverage and older releases without cluttering the main workflow.

## Verification
Lint, TypeScript and production build passed on Node 22.19.0.
259 tests passed; one optional real-workbook test skipped.

## Boundaries
No invented scores, financial dashboard results or authenticated approval. Persistence follows in 4.5.
```

Initially base **feat/policy-versioning**, compare **feat/policy-confidence**. **After PR 1 is merged**, edit this PR's base to **main**, verify that Files changed contains only the 4.4 changes, wait for checks, then merge with **Create a merge commit**.

## PR 3 — Phase 4.5

[Initial stacked comparison](https://github.com/Anshumaan657/3D-Profit-Intelligence/compare/feat/policy-confidence...feat/policy-portability)

Title: **Phase 4.5 — Policy archive portability and final verification**

```markdown
## Summary
Adds validated policy archive backup/restore and consent-based local persistence, completing the Phase 4 governance workflow.

## Changes
- Export complete version histories and pinned calculations as JSON.
- Validate and preview imports in a cancellable worker before merging.
- Reject divergent histories and prevent silent overwrite of newer data.
- Preserve and replay original confidence evidence in pinned results.
- Add explicit unencrypted local-storage consent, fixed retention, expiry and deletion.
- Restore a master snapshot only after separate confirmation.
- Add archive, privacy, cancellation and historical-replay regressions and handoff documentation.

## Verification
Lint, TypeScript and production build passed on Node 22.19.0.
281 tests passed normally; all 282 passed with the real MMS sample and a 30-second timeout.
npm audit reported zero vulnerabilities.

## Boundaries
Device-local storage is not tamper-proof. Business acceptance, browser certification, historical profit engines and forecasting remain separate work.
```

Initially base **feat/policy-confidence**, compare **feat/policy-portability**. **After PR 2 is merged**, change the base to **main**, verify its isolated diff and checks, then merge with **Create a merge commit**.

Keep the stacked branches until all three merges finish. **Do not squash or rebase-merge this stack**: preserving ancestry keeps each next PR's diff isolated. If GitHub reports conflicts or unexpected extra changes, stop and share the message rather than force-pushing.

## After all three GitHub merges

```bash
git switch main
git pull --ff-only origin main
git status
```

Do not start the next major project phase until the owner has reviewed and confirmed these merges.
