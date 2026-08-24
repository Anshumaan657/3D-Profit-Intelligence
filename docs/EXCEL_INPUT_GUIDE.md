# Excel input guide

## Supported files

Use one unprotected MMS workbook in `.xls` or `.xlsx` format, up to 50 MB. Macro-enabled `.xlsm`, password-protected, damaged and renamed files whose binary signature does not match the extension are rejected.

The file is read inside the browser and is never modified or uploaded by the importer.

## Required sheets

The workbook must contain both of these sheets. Common spacing and naming variants are accepted.

### Product Log Book

Required columns:

- `Date`
- `Machine`
- `Shift`
- `From Time`
- `Till Time`
- `Qty`
- `Opr. Time`
- `Std. Cycle Time`

The importer also maps known optional MMS fields including product identifiers, operator, machine type, costs, setup and shift times, stroke, multiplier, loss, rejection and rework quantities.

### Down Time Details

Required columns:

- `Date`
- `Machine`
- `Shift`
- `From Time`
- `Till Time`
- `Duration`

Revenue, reason type, reason, product and operator columns are optional but recommended.

Headers can appear within the first 50 rows. The contract accepts documented aliases such as `Production Date`, `Actual Qty`, `Operating Time`, `Downtime Duration` and `Reason Type`.

## Interpretation rules

- `Qty` is the authoritative reported production quantity.
- `Stroke × M. Factor` is compared with `Qty` and creates a warning when they differ. It never replaces `Qty`.
- Cross-midnight end times can be inferred for night-shift intervals and are disclosed as warnings.
- Saved formula values are read without recalculating formulas. Formula cells without a saved value remain unavailable and are reported.
- Exact duplicates are retained with their source rows and excluded from totals.
- Negative values are retained, flagged for classification and excluded from ordinary totals.
- Invalid records are retained as evidence and excluded from totals. The whole import is rejected when more than 25% of core production and downtime rows are invalid.
- Rows labelled `Total` are excluded from canonical records.

## Compatibility report

After a successful import, the review screen shows the record counts, machines, products, date coverage and data-quality findings. Use **Download JSON report** for a machine-readable record or **Print report** for a review copy.

The report contains workbook metadata and issue references, not a modified copy of the source workbook.
