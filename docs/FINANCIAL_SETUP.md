# Financial setup guide

## Simple workflow

1. Import the MMS workbook. Validation and normalization run automatically.
2. Continue to Financial Setup, enter the factory and choose analysis dates.
3. Use **Use MMS names & available dates** to add discovered product/machine identifiers. Existing entries are preserved; financial rates and units are not invented.
4. Complete one section at a time. You can skip unknown sections and keep an incomplete draft.
5. Open Review Setup to see missing inputs, conflicts and warnings. Click a finding to return to its section/entry.
6. Export a backup or explicitly enable local draft saving.

Financial Setup also works before an MMS import. In that case source coverage and matching remain unverified. Actual financial analysis is a later phase.

## Sections

| Section | Inputs |
| --- | --- |
| Products | Product ID/name, MMS unit, financial unit, tax-exclusive price, material cost, packaging, transport, discount and GST |
| Machines | Consolidated hourly rate OR base, electricity, maintenance provision and tooling components |
| Labour | Group/operator ID, rate, operator-shift/operator-hour/machine-hour/fixed-period basis, paid shift hours and overtime multiplier |
| Overheads | Name, amount, daily/monthly period and machine/hour/product/quantity allocation |
| Quality & scrap | Product-specific rejection cost, incremental rework cost, scrap recovery and rejection stage |
| Factory calendar | Working-week schedules, weekdays, shifts, paid hours and dated shutdown/working-day exceptions |
| Unit conversions | Product, source unit, financial unit and positive conversion factor |
| Aliases | Product/machine/labour source identifier mapped to a financial-master target ID |

## Values and evidence

- Blank means **missing**, not zero. Enter zero only when verified.
- Negative rates, malformed numbers, percentages above 100 and invalid dates are flagged.
- Every row has effective-from/through dates, evidence status, confirmer and source/assumption note.
- `draft`, `estimated` and `provisional` are not confirmed inputs. Confirmed entries require a named confirmer and note. This is self-declared in a local MVP, not authenticated approval.
- Editing a confirmed rate returns it to draft. Use **Copy to new effective period** for price/rate changes and end the previous period first.
- Effective through is inclusive. A new rate starting on the previous rate's last day overlaps and must be corrected.
- Missing date coverage is flagged. No future or retrospective rates are silently invented.
- Consolidated machine costs must not also contain itemized components. For itemized mode all components must be supplied, including explicit verified zero where applicable.
- Unit conversions are direct and product-specific: financial quantity = source quantity × factor. Confirmed conversions must cover differing product units over the applicable period.
- Aliases must point to existing master IDs, must not conflict with another canonical ID, and require confirmed evidence before they satisfy MMS monetary matching coverage.

## Factory calendar

The analysis date range is the requested reporting period. The factory calendar is the planned operating schedule; it is not the same filter.

Use weekdays `1,2,3,4,5,6` for Monday–Saturday, for example. Sunday is `7`. Working schedules need whole shifts and paid hours totaling no more than 24 hours per day. Shutdown and working-day exceptions need both start and end dates. Overlapping or contradictory exceptions are flagged. No public holidays are assumed automatically.

## Excel and JSON

Open **Import, export & template**. The generated Excel workbook contains Guide, Metadata and all eight section sheets. The Guide lists exact field keys and accepted enum values.

- Edit rows beneath the header. Keep sheet/column keys and schema metadata unchanged.
- In Metadata you may edit factory, timezone and analysis scope dates. Keep schemaVersion, id, revision and updatedAt valid.
- New rows may leave `id` blank; an ID is assigned on import.
- Use `YYYY-MM-DD` for dates. Section date cells also accept Excel serial dates, including the workbook's 1904 date system.
- Blank optional sheets must remain present. Extra unknown sheets/columns are rejected so data is not silently discarded.
- Financial files support `.xlsx`, `.xls` and `.json`; the safety limits are 10 MB and 10,000 entries. Macros and password-protected workbooks are unsupported.
- Saved formula results may be imported with a warning; formulas themselves are not retained or executed. Missing cached results and Excel error cells reject the import.
- Import first presents a replacement preview. **Keep current draft** leaves current work unchanged. **Replace current draft** explicitly replaces all sections; it is not a merge.
- Excel exports use numeric values for valid rates. Excel's normal numeric precision/formatting limits apply. JSON retains exact draft strings and is the recommended full-fidelity backup.
- Exports contain financial data. Store them securely and never commit real masters to Git.

## Optional local saving

Saving is off by default. Open **Privacy & local draft** and consent only on a trusted browser profile. Data is unencrypted, with 30-day default retention (1–90 days configurable before enabling).

Autosaving occurs after edits and flushes on page hide. Restore replaces the current draft only after confirmation and does not renew consent automatically. Deletion stops automatic saving and removes the saved draft; the current in-memory work remains visible. Browser storage failures are reported; export a backup instead.

Draft revision numbers identify working changes. They are not immutable approved financial-policy versions. Full policy history and calculations come later.
