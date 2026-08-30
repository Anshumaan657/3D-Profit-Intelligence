import * as XLSX from "xlsx";
import { validateMmsFileEnvelope } from "../mms/workbook-contract";
import { emptyMaster, fieldsFor, parseMaster, SECTION_KEYS, SECTIONS, type FinancialMaster } from "./schema";
import { numberValue } from "./validation";

export const MAX_MASTER_BYTES = 10 * 1024 * 1024;
const safeText = (value: string) => /^[=+\-@\t\r\n']/.test(value) ? `'${value}` : value;
const originalText = (value: string) => /^'[=+\-@\t\r\n']/.test(value) ? value.slice(1) : value;

export function exportMasterJson(master: FinancialMaster): string {
  return JSON.stringify(parseMaster(master), null, 2);
}
export function importMasterJson(text: string): FinancialMaster {
  if (new TextEncoder().encode(text).length > MAX_MASTER_BYTES) throw new Error("Financial master must be under 10 MB.");
  try { return parseMaster(JSON.parse(text)); } catch (error) {
    if (error instanceof SyntaxError) throw new Error("JSON is malformed. The current draft was not changed.");
    throw error;
  }
}

export function exportMasterExcel(master: FinancialMaster): ArrayBuffer {
  const checked = parseMaster(master);
  const book = XLSX.utils.book_new();
  function append(name: string, rows: (string | number | null)[][]) {
    const sheet = XLSX.utils.aoa_to_sheet(rows.map(row => row.map(value => typeof value === "string" ? safeText(value) : value)));
    sheet["!cols"] = rows[0].map((_, index) => ({ wch: index === 0 ? 38 : 24 }));
    sheet["!autofilter"] = { ref: sheet["!ref"]! };
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  append("Guide", [
    ["3D Profit Intelligence", "Financial master · schema 1"],
    ["How to use", "Edit rows below headers. Keep keys and schema metadata unchanged; edit factory, timezone and scope dates in Metadata."],
    ["Unknown values", "Leave blank. Enter numeric zero only when verified. Money is INR; prices exclude GST."],
    ["Dates", "Use YYYY-MM-DD. Effective through is inclusive; blank means open-ended."],
    ["Status", "draft / estimated / provisional / confirmed. Confirmed needs approvedBy and note."],
    ["Calendar weekdays", "1=Monday to 7=Sunday, comma-separated. Shutdown rules need both dates."],
    ["Conversions", "Financial quantity = MMS quantity × factor. Use direct product-specific conversions."],
    ["Safety", "Do not add macros or external links. Saved formula values only; missing caches are rejected."],
    ["Draft, not analysis", "Incomplete or invalid entries can be preserved; fix review findings before calculation."],
    ...SECTION_KEYS.flatMap(section => fieldsFor(section).map(field => [`${SECTIONS[section].sheet}.${field.key}`, `${field.label}${field.required ? " (required)" : ""}${field.options ? `: ${field.options.join(" / ")}` : ""}${field.help ? ` — ${field.help}` : ""}`])),
  ]);
  append("Metadata", [["key", "value"], ["schemaVersion", 1], ["id", checked.id], ["revision", checked.revision], ["updatedAt", checked.updatedAt], ["factory", checked.factory], ["currency", checked.currency], ["timezone", checked.timezone], ["scopeFrom", checked.scope.from], ["scopeTo", checked.scope.to]]);
  for (const section of SECTION_KEYS) {
    const fields = fieldsFor(section);
    append(SECTIONS[section].sheet, [["id", ...fields.map(f => f.key)], ...checked.sections[section].map(row => [row.id, ...fields.map(field => {
      const value = row.values[field.key];
      if (value === "") return null;
      return field.kind === "number" ? numberValue(value) ?? value : value;
    })])]);
  }
  return XLSX.write(book, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
}

export function importMasterExcel(buffer: ArrayBuffer, fileName: string, mimeType = ""): { master: FinancialMaster; warnings: string[] } {
  if (buffer.byteLength > MAX_MASTER_BYTES) throw new Error("Financial master must be under 10 MB.");
  validateMmsFileEnvelope({ buffer, fileName, mimeType });
  let book: XLSX.WorkBook;
  try { book = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: true, cellText: false }); }
  catch { throw new Error("Cannot read this financial workbook. Use an unprotected .xlsx or .xls file."); }
  const required = ["Metadata", ...SECTION_KEYS.map(s => SECTIONS[s].sheet)];
  if (required.some(name => !book.SheetNames.includes(name))) throw new Error("Use the financial-master template: Metadata and all eight section sheets are required.");
  if (book.SheetNames.some(name => ![...required, "Guide"].includes(name))) throw new Error("Unrecognized sheet in the financial master. Import would discard data; remove or rename the extra sheet first.");
  let formulas = 0;
  let totalRows = 0;
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    if (range.e.r > 10_100 || range.e.c > 40) throw new Error("Financial workbook exceeds safe row or column limits.");
    if (!['Guide', 'Metadata'].includes(name)) totalRows += range.e.r;
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      if (cell.f) {
        formulas++;
        if (cell.v == null || cell.t === "e") throw new Error(`Formula ${name}!${address} has no usable saved result. Recalculate and save it in Excel first.`);
      }
      if (cell.t === "e") throw new Error(`Excel error at ${name}!${address}. Correct it before import.`);
    }
  }
  if (totalRows > 10_000) throw new Error("Financial master exceeds 10,000 rows.");
  const grid = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
  const metaRows = grid("Metadata");
  if (String(metaRows[0]?.[0]) !== "key" || String(metaRows[0]?.[1]) !== "value") throw new Error("Metadata header must be key, value.");
  const metadata = new Map<string, unknown>();
  for (const row of metaRows.slice(1)) {
    if (row.slice(2).some(value => value !== "")) throw new Error("Unexpected data outside Metadata columns.");
    const key = String(row[0]);
    if (metadata.has(key)) throw new Error(`Duplicate metadata key: ${key}.`);
    metadata.set(key, row[1]);
  }
  const allowedMeta = ["schemaVersion", "id", "revision", "updatedAt", "factory", "currency", "timezone", "scopeFrom", "scopeTo"];
  if (allowedMeta.some(key => !metadata.has(key)) || [...metadata.keys()].some(key => !allowedMeta.includes(key))) throw new Error("Financial-master metadata keys are incomplete or unsupported.");
  const meta = (key: string) => originalText(String(metadata.get(key) ?? ""));
  const sections = emptyMaster().sections;
  for (const section of SECTION_KEYS) {
    const rows = grid(SECTIONS[section].sheet);
    const fields = fieldsFor(section);
    const headers = rows[0]?.map(String) ?? [];
    const expected = ["id", ...fields.map(f => f.key)];
    if (headers.length !== expected.length || new Set(headers).size !== expected.length || expected.some(key => !headers.includes(key))) throw new Error(`Headers in ${SECTIONS[section].sheet} do not match the template.`);
    sections[section] = rows.slice(1).filter(row => row.some(v => v !== "")).map(row => {
      if (row.slice(headers.length).some(value => value !== "")) throw new Error(`Unexpected data outside headers in ${SECTIONS[section].sheet}.`);
      const read = (key: string) => row[headers.indexOf(key)] ?? "";
      return {
        id: String(read("id") || globalThis.crypto.randomUUID()),
        values: Object.fromEntries(fields.map(field => {
          const value = read(field.key);
          if (field.kind === "date" && typeof value === "number") {
            const date = XLSX.SSF.parse_date_code(value, { date1904: Boolean(book.Workbook?.WBProps?.date1904) });
            if (!date) throw new Error(`Invalid date in ${SECTIONS[section].sheet}.`);
            return [field.key, `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`];
          }
          return [field.key, originalText(String(value))];
        })),
      };
    });
  }
  return { master: parseMaster({ schemaVersion: Number(meta("schemaVersion")), id: meta("id"), revision: Number(meta("revision")), updatedAt: meta("updatedAt"), factory: meta("factory"), currency: meta("currency"), timezone: meta("timezone"), scope: { from: meta("scopeFrom"), to: meta("scopeTo") }, sections }), warnings: formulas ? [`${formulas} formula cells used saved values. Formulas were not executed or retained.`] : [] };
}
