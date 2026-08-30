# Phase 4.5 — Portability and final verification

## Delivery

- Full-fidelity JSON archives preserve financial releases, master snapshots, approval evidence, confidence policies and pinned calculations.
- Restore validates schema, hashes, lineage, formula bindings, date overlaps and replayed calculations/confidence before applying anything.
- Preview precedes merge. Prefix-compatible histories merge without losing newer releases; forks, different factories and conflicting run IDs are rejected. Newer history cannot be overwritten by an operation that started against an older session state.
- Imported master snapshots are restored into Financial Setup only through a separate explicit confirmation; MMS input remains unchanged.
- JSON import runs in a cancellable worker. File/read cancellation guards against starting or applying obsolete work.
- Local archive saving is a separate, explicit consent from Phase 3 draft saving. It is unencrypted, defaults to 30-day fixed retention, supports 1–90 days and deletion, and never renews retention on ordinary saves.
- Pending saves are aborted on consent withdrawal. Quota/storage failures preserve in-memory data and the earlier backup. Stale/different-factory sessions cannot silently overwrite saved history.
- Expired copies are removed on read and checked every minute while an opted-in session is open. Deleting the saved policy archive does not delete Financial Setup drafts or in-memory releases.
- The policy editor retains hard-stop/custom quality rules when dates or assumption caps are revised.

The existing interface and local-only behaviour were preserved. No dependencies, external uploads, deployment or branding changes were added. Full history uses JSON; Phase 3's master Excel import/export remains separate and unchanged.

## Limits and semantics

- Archive size: 10 MB; local-storage payload: 4 MB; up to 100 releases and 1,000 pinned calculations. Quotas can be smaller on a particular browser.
- Every release holds a complete master snapshot, so larger setups may reach the archive limit before the release-count limit. Export backups regularly; do not delete ancestors to bypass integrity checks.
- SHA-256 and replay detect accidental or inconsistent changes, **not authenticated signatures or tamper-proof storage**. Someone with full archive access can rewrite and recompute hashes.
- Archives contain sensitive rates, financial snapshots and pinned request evidence. Raw MMS workbook buffers are not included. Source fingerprints are supplied by callers and are not proof that an external source is genuine.
- Old pinned calculations keep their original policy, master release and confidence evidence. Explicitly create a new analysis to use later governance; do not relabel an older provisional result as confirmed.
- Core confidence evaluation requires evidence-backed assessment methods from future source/mapping engines. The current policy UI configures rules; it does not invent final financial results or expose an overall-score override.
- Historical aggregation, invoice/accounting integration, the full causal cost/loss ledger, forecasting and authenticated multi-user approval remain later project phases.

## Final verification

On Node.js 22.19.0:

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| Default suite | 281 passed; one optional real-workbook test skipped; 12 files passed |
| Full suite with the supplied real workbook | 282 passed; no skipped tests; 30-second sample timeout |
| Production build | Passed |
| npm dependency audit | 0 reported vulnerabilities |
| Whitespace/scope review | Passed; no client workbook, secrets, exports or new dependencies staged |

The tests cover publication/approval, historical replay, confidence caps, import/restore conflicts, corrupt and rehashed inconsistent archives, consent, expiry, quota errors, cancellation and existing wizard/importer workflows. Rendered component tests and a responding local preview are not independent Chrome/Edge/WebKit visual or accessibility certification. Large-file release performance benchmarks and formal security/business acceptance remain outstanding.

Local preview: `http://localhost:3000` (existing project dev server reused). Choose **Policies & history**; create a factory in Financial Setup before capturing a release. A blank archive is intentional—no production policy dates, approval names or thresholds are prefilled.

The three-subphase branch/PR handoff is documented in `PHASE_4_STACKED_PRS.md`.
