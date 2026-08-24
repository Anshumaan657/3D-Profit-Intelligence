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
