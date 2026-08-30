# Security and privacy

## Default boundary

Raw factory data must stay on the user device unless explicit permission authorizes an approved protected deployment. The public Vercel demonstration may use sanitized demonstration data only.

## Workbook handling requirements

- Validate extension, MIME type, file signature, size and workbook schema.
- Reject password-protected and macro-enabled workbooks in the MVP.
- Never execute macros, scripts or external links.
- Read cached formula values without recalculating formulas.
- Sanitize workbook text before rendering or exporting it.
- Protect exported text from spreadsheet-formula injection.
- Run parsing and heavy normalization in a cancellable Web Worker.

## Repository safeguards

Spreadsheet files, uploads, normalized snapshots, generated reports, local data and environment secrets are ignored by source control.

## Application safeguards

The foundation disables the framework signature header, blocks framing, limits browser capabilities, disables search indexing and establishes a Content Security Policy. The policy must be tightened and formally reviewed before handling real client financial data in production.

Telemetry and error reporting remain disabled unless a later opt-in design is approved.

## Financial setup storage and portability

- Financial drafts start in memory. Navigating between steps preserves them; refresh requires a backup or previously consented local draft.
- Optional local saving is **unencrypted**, clearly disclosed and off by default. Do not enable it on shared browser profiles. Passphrase encryption is not implemented in Phase 3.
- Default retention is 30 days from consent (configurable 1–90). Expired drafts are removed when read. Revoking consent stops writes and removes only the application's draft key.
- Restoration does not silently re-enable automatic saving. Storage/quota failures retain the in-memory draft and display a backup instruction.
- The optional saved draft contains financial inputs, names/mappings, date scope and metadata, not raw MMS source rows.
- JSON and Excel imports validate schema/version, size and structure before replacement. Unknown fields/sheets fail closed; invalid business entries may remain as explicitly flagged drafts.
- Exported spreadsheet text is escaped against formula injection. Financial formulas are not executed; cached values are reported, and missing/error cached results reject the financial import.
- Named confirmation in the local MVP is not authentication or a digital signature. Formal approval/audit controls remain later work.

## Policy release archives (Phase 4.5)

Policy archives contain complete financial-master snapshots, approval notes and possibly pinned request/result evidence. They are sensitive even though raw MMS workbook buffers are excluded. JSON downloads should be stored securely.

Archive persistence uses its own `3d-profit-intelligence:policy-archive:v1` key and separate explicit consent. The saved copy is unencrypted, expires after 30 days by default (1–90 configurable), and can be deleted without deleting other draft keys. Consent withdrawal aborts pending saves. Reads and active-session expiry checks remove expired copies; browser closure itself cannot execute scheduled deletion. Storage failures preserve in-memory data and are reported.

Archive import is limited to 10 MB; local saved payloads to 4 MB. Validation checks schema, lineage, overlaps, known formula bindings, hashes and pinned-result replay. Conflicting histories are rejected rather than overwritten. SHA-256 is an integrity check, not authenticated evidence: someone controlling the whole archive can rewrite it and recompute hashes. Approval identities remain self-declared until the later authenticated multi-user workflow.
