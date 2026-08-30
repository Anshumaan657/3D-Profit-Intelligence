import { fieldsFor, SECTION_KEYS, SECTIONS, type FinancialMaster, type MasterRow, type SectionKey } from "./schema";

export type SetupIssue = { section: SectionKey | "setup"; rowId?: string; field?: string; level: "error" | "missing" | "warning"; message: string };
export type MmsCatalog = { products: string[]; machines: string[] };
export const keyOf = (value: string) => value.normalize("NFKC").trim().toLowerCase();
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function numberValue(raw: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
export const activeOn = (row: MasterRow, date: string) => validDate(row.values.effectiveFrom) && row.values.effectiveFrom <= date && (!row.values.effectiveTo || row.values.effectiveTo >= date);
function overlaps(a: MasterRow, b: MasterRow): boolean {
  return a.values.effectiveFrom <= (b.values.effectiveTo || "9999-12-31") && b.values.effectiveFrom <= (a.values.effectiveTo || "9999-12-31");
}
export function covers(rows: MasterRow[], from: string, to: string): boolean {
  let cursor = from;
  for (const row of [...rows].sort((a, b) => a.values.effectiveFrom.localeCompare(b.values.effectiveFrom))) {
    if (!validDate(row.values.effectiveFrom) || (row.values.effectiveTo && !validDate(row.values.effectiveTo))) continue;
    const end = row.values.effectiveTo || "9999-12-31";
    if (end < cursor) continue;
    if (row.values.effectiveFrom > cursor) return false;
    if (end >= to) return true;
    cursor = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return false;
}

export function validateMaster(master: FinancialMaster, catalog?: MmsCatalog): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const add = (section: SetupIssue["section"], level: SetupIssue["level"], message: string, row?: MasterRow, field?: string) => issues.push({ section, level, message, rowId: row?.id, field });
  if (!master.factory.trim()) add("setup", "missing", "Enter the factory name.", undefined, "factory");
  try { new Intl.DateTimeFormat("en", { timeZone: master.timezone }); } catch { add("setup", "error", "Enter a supported IANA timezone, such as Asia/Kolkata.", undefined, "timezone"); }
  const scopeValid = validDate(master.scope.from) && validDate(master.scope.to) && master.scope.from <= master.scope.to;
  if (!scopeValid) add("setup", "missing", "Choose a valid analysis date range.", undefined, "scope");
  for (const section of ["products", "machines", "labour", "calendar"] as const) {
    if (!master.sections[section].length) add(section, "missing", `Add ${SECTIONS[section].title.toLowerCase()} before complete financial analysis.`);
  }
  if (!master.sections.overheads.length) add("overheads", "warning", "No overheads supplied. This is not an assumption of zero overhead.");
  if (!master.sections.quality.length) add("quality", "warning", "Quality costs and scrap recovery have not been supplied; related amounts will remain unavailable.");

  for (const section of SECTION_KEYS) {
    const groups = new Map<string, MasterRow[]>();
    for (const row of master.sections[section]) {
      const v = row.values;
      for (const field of fieldsFor(section)) {
        const raw = (v[field.key] ?? "").trim();
        if (!raw) {
          if (field.required) add(section, "missing", `${field.label} is missing.`, row, field.key);
          continue;
        }
        if (field.kind === "date" && !validDate(raw)) add(section, "error", `${field.label} is not a valid date.`, row, field.key);
        if (field.kind === "select" && !field.options?.includes(raw)) add(section, "error", `${field.label} has an unsupported value.`, row, field.key);
        if (field.kind === "number") {
          const value = numberValue(raw);
          if (value === null || value < 0 || (field.positive && value <= 0) || (field.max !== undefined && value > field.max)) add(section, "error", `${field.label} must be ${field.positive ? "positive" : "zero or positive"}${field.max === undefined ? "" : ` and at most ${field.max}`}.`, row, field.key);
        }
      }
      if (v.effectiveTo && v.effectiveFrom > v.effectiveTo) add(section, "error", "Effective through must be on or after effective from.", row, "effectiveTo");
      if (v.status === "confirmed" && (!v.approvedBy.trim() || !v.note.trim())) add(section, "error", "Confirmed entries require a named confirmer and source/approval note.", row, !v.approvedBy.trim() ? "approvedBy" : "note");
      if (v.status !== "confirmed") add(section, "warning", "Entry is not confirmed; later results must disclose its provisional evidence.", row, "status");
      if (section === "machines") {
        const parts = ["baseRate", "electricity", "maintenance", "tooling"];
        const required = v.rateMode === "consolidated" ? ["hourlyRate"] : v.rateMode === "itemized" ? parts : [];
        for (const field of required) if (!v[field].trim()) add(section, "missing", `Supply ${field}; enter zero only when verified.`, row, field);
        const forbidden = v.rateMode === "consolidated" ? parts : v.rateMode === "itemized" ? ["hourlyRate"] : [];
        for (const field of forbidden) if (v[field].trim()) add(section, "error", "Consolidated and itemized costs cannot be combined. Clear the unused rate fields.", row, field);
      }
      if (section === "labour") {
        if (v.basis === "operator_shift" && !v.paidHours) add(section, "missing", "Paid hours are required for a shift rate.", row, "paidHours");
        if (v.basis === "fixed_period" && !v.period) add(section, "missing", "Choose the fixed-rate period.", row, "period");
      }
      if (section === "calendar") {
        if (v.kind !== "shutdown") {
          if (!v.shifts || !v.paidHours) add(section, "missing", "Working schedules require shifts and paid hours.", row, !v.shifts ? "shifts" : "paidHours");
          if (Number(v.shifts) * Number(v.paidHours) > 24 || (v.shifts && !Number.isInteger(Number(v.shifts)))) add(section, "error", "Use whole shifts whose total paid hours do not exceed 24 per day.", row, "shifts");
        }
        if (v.kind === "working_week" && !/^[1-7](,[1-7])*$/.test(v.weekdays)) add(section, "error", "Weekdays must be comma-separated numbers from 1 to 7.", row, "weekdays");
        if (v.kind === "working_week" && new Set(v.weekdays.split(",")).size !== v.weekdays.split(",").length) add(section, "error", "Do not repeat weekdays.", row, "weekdays");
        if ((v.kind === "working_day" || v.kind === "shutdown") && !v.effectiveTo) add(section, "missing", "Calendar exceptions require an end date.", row, "effectiveTo");
      }
      if (section === "quality" || section === "conversions") {
        const products = master.sections.products.filter(p => keyOf(p.values.productId) === keyOf(v.productId));
        if (!products.length) add(section, "error", "Product ID does not exist in Products.", row, "productId");
        if (section === "conversions" && keyOf(v.fromUnit) === keyOf(v.toUnit)) add(section, "error", "Conversion units must be different.", row, "toUnit");
      }
      if (section === "aliases") {
        const targetSection = v.entity === "product" ? "products" : v.entity === "machine" ? "machines" : "labour";
        const targetField = v.entity === "product" ? "productId" : v.entity === "machine" ? "machineId" : "groupId";
        if (!master.sections[targetSection].some(target => keyOf(target.values[targetField]) === keyOf(v.target))) add(section, "error", "Alias target is not a financial-master ID.", row, "target");
        if (keyOf(v.source) !== keyOf(v.target) && master.sections[targetSection].some(target => keyOf(target.values[targetField]) === keyOf(v.source))) add(section, "error", "Alias source conflicts with a different existing master ID. Use an unambiguous source mapping.", row, "source");
      }
      if (section === "quality") for (const field of ["rejectionCost", "reworkCost", "scrapRecovery"]) if (!v[field]) add(section, "warning", `${field} is unknown, not zero.`, row, field);
      const groupKey = SECTIONS[section].identity.map(field => keyOf(v[field])).join("|");
      const group = groups.get(groupKey) ?? [];
      group.push(row); groups.set(groupKey, group);
    }
    for (const rows of groups.values()) {
      const sorted = rows.filter(r => validDate(r.values.effectiveFrom)).sort((a, b) => a.values.effectiveFrom.localeCompare(b.values.effectiveFrom));
      let furthest: MasterRow | undefined;
      for (const row of sorted) {
        if (furthest && overlaps(furthest, row)) add(section, "error", "Effective-date ranges overlap for the same item. End the earlier rate before the new rate begins.", row, "effectiveFrom");
        if (!furthest || (row.values.effectiveTo || "9999-12-31") > (furthest.values.effectiveTo || "9999-12-31")) furthest = row;
      }
      if (scopeValid && ["products", "machines", "labour", "overheads"].includes(section) && !covers(rows, master.scope.from, master.scope.to)) add(section, "missing", "This item's rates do not cover the entire selected period.", rows[0], "effectiveFrom");
    }
  }
  if (scopeValid && !covers(master.sections.calendar.filter(r => r.values.kind === "working_week"), master.scope.from, master.scope.to)) add("calendar", "missing", "A working-week schedule must cover the selected period.");
  for (const row of master.sections.calendar.filter(r => r.values.kind === "working_day")) {
    if (master.sections.calendar.some(other => other.values.kind === "shutdown" && overlaps(row, other))) add("calendar", "error", "Working-day override conflicts with a shutdown. Resolve the date ranges.", row, "effectiveFrom");
  }
  for (const product of master.sections.products) {
    const p = product.values;
    if (p.unit && p.sourceUnit && keyOf(p.unit) !== keyOf(p.sourceUnit)) {
      const conversions = master.sections.conversions.filter(r => keyOf(r.values.productId) === keyOf(p.productId) && keyOf(r.values.fromUnit) === keyOf(p.sourceUnit) && keyOf(r.values.toUnit) === keyOf(p.unit) && r.values.status === "confirmed" && r.values.approvedBy && r.values.note && (numberValue(r.values.factor) ?? 0) > 0);
      if (!covers(conversions, p.effectiveFrom, p.effectiveTo || (scopeValid ? master.scope.to : p.effectiveFrom))) add("conversions", "missing", `An approved conversion covering the applicable period is needed for ${p.productId}: ${p.sourceUnit} → ${p.unit}.`);
    }
  }
  if (catalog && scopeValid) for (const entity of ["product", "machine"] as const) {
    const sourceNames = entity === "product" ? catalog.products : catalog.machines;
    const section = entity === "product" ? "products" : "machines";
    const field = entity === "product" ? "productId" : "machineId";
    for (const name of sourceNames) {
      const direct = master.sections[section].filter(r => keyOf(r.values[field]) === keyOf(name));
      const aliases = master.sections.aliases.filter(r => r.values.entity === entity && keyOf(r.values.source) === keyOf(name) && r.values.status === "confirmed" && r.values.approvedBy && r.values.note);
      const mapped = aliases.filter(alias => covers(master.sections[section].filter(r => keyOf(r.values[field]) === keyOf(alias.values.target)), master.scope.from, master.scope.to));
      if (!covers(direct, master.scope.from, master.scope.to) && !covers(mapped, master.scope.from, master.scope.to)) add(section, "missing", `MMS ${entity} “${name}” needs a rate or approved alias covering the selected dates.`);
    }
  }
  return issues;
}

export function calendarDay(master: FinancialMaster, date: string): { working: boolean; paidHours: number; shifts: number } | null {
  if (!validDate(date)) return null;
  const rules = master.sections.calendar.filter(row => activeOn(row, date));
  const weekly = rules.filter(row => row.values.kind === "working_week");
  const overrides = rules.filter(row => row.values.kind === "working_day");
  if (weekly.length > 1 || overrides.length > 1 || (overrides.length && rules.some(row => row.values.kind === "shutdown"))) return null;
  if (rules.some(row => row.values.kind === "shutdown")) return { working: false, paidHours: 0, shifts: 0 };
  const row = rules.find(row => row.values.kind === "working_day") ?? rules.find(row => row.values.kind === "working_week");
  if (!row) return null;
  const shifts = numberValue(row.values.shifts), paidHours = numberValue(row.values.paidHours);
  if (shifts == null || paidHours == null || !Number.isInteger(shifts) || shifts <= 0 || paidHours <= 0 || shifts * paidHours > 24 || (row.values.kind === "working_week" && !/^[1-7](,[1-7])*$/.test(row.values.weekdays))) return null;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const working = row.values.kind === "working_day" || row.values.weekdays.split(",").includes(String(weekday));
  return { working, paidHours: working ? Number(row.values.paidHours) : 0, shifts: working ? Number(row.values.shifts) : 0 };
}
