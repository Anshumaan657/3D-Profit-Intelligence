import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { emptyMaster, newRow, parseMaster, revise, SECTIONS, type FinancialMaster, type SectionKey } from "./schema";
import { calendarDay, covers, numberValue, validateMaster, validDate } from "./validation";
import { exportMasterExcel, exportMasterJson, importMasterExcel, importMasterJson } from "./portability";
import { deleteDraft, DRAFT_KEY, loadDraft, saveDraft } from "./draft-storage";

function add(master: FinancialMaster, section: SectionKey, values: Record<string, string>) {
  const row = newRow(section);
  row.values = { ...row.values, effectiveFrom: "2026-01-01", status: "confirmed", approvedBy: "Test reviewer", note: "Synthetic test assumption", ...values };
  master.sections[section].push(row);
  return row;
}
function fixture(): FinancialMaster {
  const master = emptyMaster();
  master.factory = "Synthetic factory";
  master.scope = { from: "2026-01-01", to: "2026-01-31" };
  add(master, "products", { productId: "P1", name: "Test part", unit: "piece", sourceUnit: "piece", sellingPrice: "100", materialCost: "60", packagingCost: "0" });
  add(master, "machines", { machineId: "M1", name: "Press", rateMode: "consolidated", hourlyRate: "500" });
  add(master, "labour", { groupId: "Operator group", basis: "operator_shift", rate: "800", paidHours: "8" });
  add(master, "overheads", { name: "Rent", amount: "30000", period: "month", allocation: "operative_hour" });
  add(master, "quality", { productId: "P1", rejectionCost: "60", reworkCost: "10", scrapRecovery: "5", rejectionStage: "in_process" });
  add(master, "calendar", { kind: "working_week", weekdays: "1,2,3,4,5,6", shifts: "1", paidHours: "8", name: "Regular week" });
  add(master, "conversions", { productId: "P1", fromUnit: "piece", toUnit: "box", factor: "0.1" });
  add(master, "aliases", { entity: "machine", source: "Press 01", target: "M1" });
  return master;
}
const problematic = (master: FinancialMaster) => validateMaster(master).filter(i => i.level !== "warning");

describe("financial-master contract and validation", () => {
  it("starts empty, in INR, with no fabricated factory costs", () => {
    const master = emptyMaster();
    expect(master.currency).toBe("INR"); expect(master.timezone).toBe("Asia/Kolkata");
    expect(Object.values(master.sections).every(rows => rows.length === 0)).toBe(true);
    expect(problematic(master).length).toBeGreaterThan(0);
  });
  it("accepts all eight configured sections", () => { expect(problematic(fixture())).toEqual([]); });
  it.each(["", " ", "invalid", "Infinity", "1e20", "1,2"])("does not turn invalid or missing numeric input %s into zero", value => { expect(numberValue(value)).toBeNull(); });
  it.each(["0", "0.00", "123.4567", ".125"])("preserves valid decimal input %s", value => { expect(numberValue(value)).toBe(Number(value)); });
  it("distinguishes missing from an explicit zero", () => {
    const master = fixture(); const row = master.sections.products[0];
    row.values.materialCost = "";
    expect(problematic(master).some(i => i.field === "materialCost" && i.level === "missing")).toBe(true);
    row.values.materialCost = "0"; expect(problematic(master)).toEqual([]);
  });
  it.each(["-1", "not money"])("rejects a bad rate %s", value => {
    const master = fixture(); master.sections.products[0].values.sellingPrice = value;
    expect(problematic(master).some(i => i.field === "sellingPrice" && i.level === "error")).toBe(true);
  });
  it("enforces percentage limits", () => {
    const master = fixture(); master.sections.products[0].values.gstPercent = "101";
    expect(problematic(master).some(i => i.field === "gstPercent")).toBe(true);
  });
  it("rejects unsupported dates and timezones", () => {
    expect(validDate("2026-02-30")).toBe(false); expect(validDate("2024-02-29")).toBe(true);
    const master = fixture(); master.timezone = "Imaginary/Plant";
    expect(problematic(master).some(i => i.field === "timezone")).toBe(true);
  });
  it("detects overlaps including inclusive boundary days", () => {
    const master = fixture(); master.sections.products[0].values.effectiveTo = "2026-01-15";
    const row = add(master, "products", { ...master.sections.products[0].values, effectiveFrom: "2026-01-15", effectiveTo: "" });
    expect(problematic(master).some(i => i.rowId === row.id && i.message.includes("overlap"))).toBe(true);
    row.values.effectiveFrom = "2026-01-16"; expect(problematic(master)).toEqual([]);
  });
  it("detects uncovered gaps in selected dates", () => {
    const master = fixture(); master.sections.machines[0].values.effectiveTo = "2026-01-15";
    expect(problematic(master).some(i => i.section === "machines" && i.message.includes("cover"))).toBe(true);
  });
  it("requires confirmation evidence", () => {
    const master = fixture(); master.sections.products[0].values.approvedBy = "";
    expect(problematic(master).some(i => i.field === "approvedBy")).toBe(true);
  });
  it("does not double count consolidated machine components", () => {
    const master = fixture(); const row = master.sections.machines[0]; row.values.electricity = "20";
    expect(problematic(master).some(i => i.message.includes("cannot be combined"))).toBe(true);
    row.values.rateMode = "itemized"; row.values.hourlyRate = "";
    row.values.baseRate = "400"; row.values.maintenance = "0"; row.values.tooling = "5";
    expect(problematic(master)).toEqual([]);
  });
  it("requires period and shift details for the selected labour basis", () => {
    const master = fixture(); master.sections.labour[0].values.paidHours = "";
    expect(problematic(master).some(i => i.field === "paidHours")).toBe(true);
    master.sections.labour[0].values.basis = "fixed_period";
    expect(problematic(master).some(i => i.field === "period")).toBe(true);
  });
  it("rejects orphaned quality and conversion references", () => {
    const master = fixture(); master.sections.quality[0].values.productId = "Missing"; master.sections.conversions[0].values.productId = "Missing";
    expect(problematic(master).filter(i => i.message.includes("does not exist"))).toHaveLength(2);
  });
  it("requires approved matching conversions when source and financial units differ", () => {
    const master = fixture(); master.sections.products[0].values.unit = "box";
    expect(problematic(master)).toEqual([]);
    master.sections.conversions[0].values.status = "provisional";
    expect(problematic(master).some(i => i.section === "conversions" && i.level === "missing")).toBe(true);
  });
  it("rejects zero conversion factors and identical units", () => {
    const master = fixture(); master.sections.conversions[0].values.factor = "0"; master.sections.conversions[0].values.toUnit = "piece";
    expect(problematic(master).filter(i => i.section === "conversions")).toHaveLength(2);
  });
  it("validates alias targets and MMS matching coverage", () => {
    const master = fixture(); const catalog = { products: ["P1"], machines: ["Press 01"] };
    expect(validateMaster(master, catalog).filter(i => i.level !== "warning")).toEqual([]);
    master.sections.aliases[0].values.target = "Unknown";
    expect(validateMaster(master, catalog).filter(i => i.level !== "warning").length).toBe(2);
  });
  it("keeps missing scrap recovery unavailable", () => {
    const master = fixture(); master.sections.quality[0].values.scrapRecovery = "";
    expect(validateMaster(master).some(i => i.field === "scrapRecovery" && i.message.includes("unknown"))).toBe(true);
  });
  it("rejects conflicting calendar overrides and excessive shift hours", () => {
    const master = fixture(); master.sections.calendar[0].values.shifts = "3"; master.sections.calendar[0].values.paidHours = "9";
    add(master, "calendar", { kind: "shutdown", effectiveFrom: "2026-01-02", effectiveTo: "2026-01-03", name: "Shutdown" });
    add(master, "calendar", { kind: "working_day", effectiveFrom: "2026-01-02", effectiveTo: "2026-01-02", name: "Override", shifts: "1", paidHours: "8" });
    expect(problematic(master).some(i => i.message.includes("24"))).toBe(true);
    expect(problematic(master).some(i => i.message.includes("conflicts"))).toBe(true);
    expect(calendarDay(master, "2026-01-02")).toBeNull();
  });
  it("resolves normal days, Sundays and shutdowns", () => {
    const master = fixture(); expect(calendarDay(master, "2026-01-01")).toEqual({ working: true, paidHours: 8, shifts: 1 });
    expect(calendarDay(master, "2026-01-04")?.working).toBe(false);
    add(master, "calendar", { kind: "shutdown", effectiveFrom: "2026-01-05", effectiveTo: "2026-01-06", name: "Maintenance" });
    expect(calendarDay(master, "2026-01-05")?.working).toBe(false);
    expect(calendarDay(master, "bad date")).toBeNull();
  });
  it("creates a new draft revision without mutating the original", () => {
    const master = fixture(); const next = revise(master, { factory: "New name" });
    expect(master.factory).toBe("Synthetic factory"); expect(next.revision).toBe(master.revision + 1);
  });
  it("fails closed for unknown fields, versions and duplicate row IDs", () => {
    const master = fixture();
    expect(() => parseMaster({ ...master, schemaVersion: 2 })).toThrow();
    master.sections.products[0].values.arbitrary = "value"; expect(() => parseMaster(master)).toThrow(/Unknown field/);
    delete master.sections.products[0].values.arbitrary;
    master.sections.machines[0].id = master.sections.products[0].id; expect(() => parseMaster(master)).toThrow(/Duplicate row IDs/);
  });
  it("handles contiguous coverage without rounding dates", () => {
    const master = fixture(); const row = master.sections.products[0]; row.values.effectiveTo = "2026-01-15";
    const next = add(master, "products", { ...row.values, effectiveFrom: "2026-01-16", effectiveTo: "2026-01-31" });
    expect(covers([row, next], "2026-01-01", "2026-01-31")).toBe(true);
  });
});

describe("Excel and JSON portability", () => {
  it("round-trips every financial section in JSON and Excel", () => {
    const master = fixture();
    expect(importMasterJson(exportMasterJson(master))).toEqual(master);
    const result = importMasterExcel(exportMasterExcel(master), "master.xlsx");
    expect(result.master).toEqual(master); expect(result.warnings).toEqual([]);
  });
  it("preserves unknown, invalid and zero inputs as an editable draft", () => {
    const master = fixture(); master.sections.products[0].values.materialCost = ""; master.sections.products[0].values.sellingPrice = "invalid";
    expect(importMasterExcel(exportMasterExcel(master), "master.xlsx").master).toEqual(master);
  });
  it.each(["=1+1", "+SUM(A1)", "-formula", "@SUM(A1)", "'literal", "\tbad"])("escapes spreadsheet text safely and reversibly: %s", value => {
    const master = fixture(); master.sections.products[0].values.name = value;
    const buffer = exportMasterExcel(master);
    const workbook = XLSX.read(buffer, { type: "array" });
    expect(Object.values(workbook.Sheets.Products).some(cell => cell?.f)).toBe(false);
    expect(importMasterExcel(buffer, "master.xlsx").master.sections.products[0].values.name).toBe(value);
  });
  it("rejects malformed JSON and unrelated workbooks", () => {
    expect(() => importMasterJson("broken")).toThrow(/malformed/);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["not MMS"]]), "Sheet1");
    expect(() => importMasterExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }), "master.xlsx")).toThrow(/template/);
  });
  it("rejects unsafe MIME and macro-enabled extensions", () => {
    const buffer = exportMasterExcel(fixture());
    expect(() => importMasterExcel(buffer, "master.xlsx", "text/html")).toThrow();
    expect(() => importMasterExcel(buffer, "master.xlsm")).toThrow();
  });
  it("reports cached formulas and rejects missing saved results", () => {
    const book = XLSX.read(exportMasterExcel(fixture()), { type: "array" });
    const sheet = book.Sheets[SECTIONS.products.sheet];
    sheet.F2 = { t: "n", v: 100, f: "50+50" };
    expect(importMasterExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }), "master.xlsx").warnings).toHaveLength(1);
    sheet.F2 = { t: "n", f: "50+50" };
    expect(() => importMasterExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }), "master.xlsx")).toThrow(/saved result/);
  });
  it("supports legacy xls financial master files", () => {
    const book = XLSX.read(exportMasterExcel(fixture()), { type: "array" });
    const buffer = XLSX.write(book, { type: "array", bookType: "xls" });
    expect(importMasterExcel(buffer, "master.xls").master).toEqual(fixtureWithIdentity(book));
    function fixtureWithIdentity(workbook: XLSX.WorkBook) { return importMasterExcel(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "master.xlsx").master; }
  });
  it("rejects extra sheets rather than silently discarding them", () => {
    const book = XLSX.read(exportMasterExcel(fixture()), { type: "array" });
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["secret extra input"]]), "Extra");
    expect(() => importMasterExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }), "master.xlsx")).toThrow(/Unrecognized sheet/);
  });
});

describe("consent-based local drafts", () => {
  function storage() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
  const now = Date.parse("2026-01-01T00:00:00Z");
  const consent = { granted: true, consentAt: new Date(now).toISOString(), retentionDays: 30 };
  it("does not write without consent", () => {
    const store = storage(); expect(() => saveDraft(store, fixture(), { ...consent, granted: false }, now)).toThrow(/consent/); expect(store.data.size).toBe(0);
  });
  it("saves and restores an incomplete draft with fixed expiry", () => {
    const store = storage(); const master = emptyMaster();
    saveDraft(store, master, consent, now);
    expect(loadDraft(store, now)?.master).toEqual(master);
    const again = saveDraft(store, master, consent, now + 86_400_000);
    expect(again.expiresAt).toBe("2026-01-31T00:00:00.000Z");
  });
  it("expires and deletes only its own storage key", () => {
    const store = storage(); store.data.set("unrelated", "preserve"); saveDraft(store, fixture(), consent, now);
    expect(loadDraft(store, now + 30 * 86_400_000)).toBeNull(); expect(store.data.get("unrelated")).toBe("preserve");
    saveDraft(store, fixture(), consent, now); deleteDraft(store); expect(store.data.has(DRAFT_KEY)).toBe(false);
  });
  it("rejects malformed storage and invalid retention", () => {
    const store = storage(); store.data.set(DRAFT_KEY, "null"); expect(() => loadDraft(store, now)).toThrow(/consent metadata/);
    expect(() => saveDraft(store, fixture(), { ...consent, retentionDays: 91 }, now)).toThrow(/Retention/);
  });
  it("propagates unavailable storage without discarding the in-memory master", () => {
    const master = fixture(); const store = storage(); store.setItem = () => { throw new Error("Quota exceeded"); };
    expect(() => saveDraft(store, master, consent, now)).toThrow(/Quota/); expect(master.factory).toBe("Synthetic factory");
  });
});
