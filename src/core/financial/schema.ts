import { z } from "zod";

export const SECTION_KEYS = ["products", "machines", "labour", "overheads", "quality", "calendar", "conversions", "aliases"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Field = { key: string; label: string; kind?: "number" | "date" | "select"; required?: boolean; options?: readonly string[]; help?: string; positive?: boolean; max?: number };
export type Section = { title: string; sheet: string; description: string; fields: Field[]; identity: string[] };

export const SECTIONS: Record<SectionKey, Section> = {
  products: {
    title: "Products", sheet: "Products", description: "Tax-exclusive selling prices and manufacturing inputs per financial unit. Leave unknown amounts blank.", identity: ["productId"],
    fields: [
      { key: "productId", label: "Product ID", required: true },
      { key: "name", label: "Product name", required: true },
      { key: "sourceUnit", label: "MMS quantity unit", required: true, help: "Confirm the source quantity unit; MMS does not supply it." },
      { key: "unit", label: "Financial unit", required: true, help: "For example: piece, kg or box. Different units require an approved conversion." },
      { key: "sellingPrice", label: "Selling price (₹/unit)", kind: "number", required: true },
      { key: "materialCost", label: "Material cost (₹/unit)", kind: "number", required: true },
      { key: "packagingCost", label: "Packaging (₹/unit)", kind: "number" },
      { key: "transportCost", label: "Transport (₹/unit)", kind: "number" },
      { key: "discountPercent", label: "Discount (%)", kind: "number", max: 100 },
      { key: "gstPercent", label: "GST (%) — separate from price", kind: "number", max: 100 },
    ],
  },
  machines: {
    title: "Machines", sheet: "Machines", description: "Record one consolidated hourly rate, or explicitly itemize its components. Do not count the same cost twice.", identity: ["machineId"],
    fields: [
      { key: "machineId", label: "Machine ID", required: true }, { key: "name", label: "Machine name", required: true },
      { key: "rateMode", label: "Rate method", kind: "select", required: true, options: ["consolidated", "itemized"] },
      { key: "hourlyRate", label: "Consolidated rate (₹/hour)", kind: "number" },
      { key: "baseRate", label: "Base machine rate (₹/hour)", kind: "number" },
      { key: "electricity", label: "Electricity (₹/hour)", kind: "number" },
      { key: "maintenance", label: "Maintenance provision (₹/hour)", kind: "number" },
      { key: "tooling", label: "Tooling / consumables (₹/hour)", kind: "number" },
    ],
  },
  labour: {
    title: "Labour", sheet: "Labour", description: "Define payable labour rates. Allocation and shared-operator calculation policies are applied in later phases.", identity: ["groupId"],
    fields: [
      { key: "groupId", label: "Labour group / operator ID", required: true },
      { key: "basis", label: "Payment basis", required: true, kind: "select", options: ["operator_shift", "operator_hour", "machine_hour", "fixed_period"] },
      { key: "rate", label: "Rate (₹ per selected basis)", kind: "number", required: true },
      { key: "paidHours", label: "Paid hours per shift", kind: "number", positive: true, max: 24 },
      { key: "overtimeMultiplier", label: "Overtime premium multiplier", kind: "number", positive: true },
      { key: "period", label: "Fixed-rate period", kind: "select", options: ["day", "month"] },
    ],
  },
  overheads: {
    title: "Overheads", sheet: "Overheads", description: "Enter rent, supervision, insurance and other operating overheads with an explicit allocation basis.", identity: ["name"],
    fields: [
      { key: "name", label: "Overhead name", required: true }, { key: "amount", label: "Amount (₹)", required: true, kind: "number" },
      { key: "period", label: "Amount applies per", required: true, kind: "select", options: ["day", "month"] },
      { key: "allocation", label: "Allocation basis", required: true, kind: "select", options: ["machine", "operative_hour", "product", "quantity"] },
    ],
  },
  quality: {
    title: "Quality & scrap", sheet: "Quality Costs", description: "Keep rejection, incremental rework and confirmed scrap recovery separate. Blank recovery means net rejection loss is unavailable.", identity: ["productId"],
    fields: [
      { key: "productId", label: "Product ID", required: true },
      { key: "rejectionCost", label: "Accrued rejection cost (₹/financial unit)", kind: "number" },
      { key: "reworkCost", label: "Incremental rework cost (₹/financial unit)", kind: "number" },
      { key: "scrapRecovery", label: "Scrap recovery (₹/financial unit)", kind: "number" },
      { key: "rejectionStage", label: "Rejection stage", kind: "select", options: ["unknown", "raw_material", "in_process", "finished"] },
    ],
  },
  calendar: {
    title: "Factory calendar", sheet: "Calendar", description: "Configure plant working days, paid shift hours and shutdowns. No holidays are assumed automatically. Dates use the factory timezone.", identity: ["kind"],
    fields: [
      { key: "kind", label: "Calendar rule", required: true, kind: "select", options: ["working_week", "shutdown", "working_day"] },
      { key: "weekdays", label: "Working weekdays", help: "1 = Monday … 7 = Sunday. Example: 1,2,3,4,5,6" },
      { key: "shifts", label: "Shifts per day", kind: "number", positive: true, max: 3 },
      { key: "paidHours", label: "Paid hours per shift", kind: "number", positive: true, max: 24 },
      { key: "name", label: "Schedule / shutdown description", required: true },
    ],
  },
  conversions: {
    title: "Unit conversions", sheet: "Unit Conversions", description: "Financial quantity = MMS quantity × factor. Use product-specific, effective-dated conversions and record approval.", identity: ["productId", "fromUnit", "toUnit"],
    fields: [
      { key: "productId", label: "Product ID", required: true }, { key: "fromUnit", label: "MMS unit", required: true },
      { key: "toUnit", label: "Financial unit", required: true }, { key: "factor", label: "Conversion factor", kind: "number", required: true, positive: true },
    ],
  },
  aliases: {
    title: "Alias mappings", sheet: "Aliases", description: "Map a source MMS name to a financial-master ID. Only confirmed mappings with a named approver are eligible for later monetary matching.", identity: ["entity", "source"],
    fields: [
      { key: "entity", label: "Mapping type", kind: "select", required: true, options: ["product", "machine", "labour"] },
      { key: "source", label: "Source MMS name / ID", required: true }, { key: "target", label: "Financial-master ID", required: true },
    ],
  },
};

export const COMMON_FIELDS: Field[] = [
  { key: "effectiveFrom", label: "Effective from", kind: "date", required: true },
  { key: "effectiveTo", label: "Effective through", kind: "date", help: "Inclusive. Leave blank for an open-ended rate." },
  { key: "status", label: "Evidence status", kind: "select", required: true, options: ["draft", "estimated", "provisional", "confirmed"] },
  { key: "approvedBy", label: "Confirmed by", help: "Required for confirmed entries. Self-declared in this local MVP; not authenticated approval." },
  { key: "note", label: "Source / assumption / approval note" },
];
export const fieldsFor = (section: SectionKey) => [...SECTIONS[section].fields, ...COMMON_FIELDS];
export type MasterRow = { id: string; values: Record<string, string> };
export type FinancialMaster = {
  schemaVersion: 1;
  id: string;
  revision: number;
  updatedAt: string;
  factory: string;
  currency: "INR";
  timezone: string;
  scope: { from: string; to: string };
  sections: Record<SectionKey, MasterRow[]>;
};
export const newId = () => globalThis.crypto.randomUUID();
export function emptyMaster(): FinancialMaster {
  return { schemaVersion: 1, id: newId(), revision: 1, updatedAt: new Date().toISOString(), factory: "", currency: "INR", timezone: "Asia/Kolkata", scope: { from: "", to: "" }, sections: { products: [], machines: [], labour: [], overheads: [], quality: [], calendar: [], conversions: [], aliases: [] } };
}
export function newRow(section: SectionKey): MasterRow {
  return { id: newId(), values: Object.fromEntries(fieldsFor(section).map(f => [f.key, f.key === "status" ? "draft" : ""])) };
}
export function revise(master: FinancialMaster, changes: Partial<FinancialMaster>): FinancialMaster {
  return { ...master, ...changes, id: master.id, schemaVersion: 1, revision: master.revision + 1, updatedAt: new Date().toISOString() };
}

const rowSchema = z.object({ id: z.string().min(1).max(100), values: z.record(z.string(), z.string().max(2000)) }).strict();
const boundary = z.object({
  schemaVersion: z.literal(1), id: z.string().min(1).max(100), revision: z.number().int().positive(), updatedAt: z.iso.datetime(),
  factory: z.string().max(200), currency: z.literal("INR"), timezone: z.string().min(1).max(100),
  scope: z.object({ from: z.string().max(10), to: z.string().max(10) }).strict(),
  sections: z.object({ products: z.array(rowSchema), machines: z.array(rowSchema), labour: z.array(rowSchema), overheads: z.array(rowSchema), quality: z.array(rowSchema), calendar: z.array(rowSchema), conversions: z.array(rowSchema), aliases: z.array(rowSchema) }).strict(),
}).strict();
export function parseMaster(value: unknown): FinancialMaster {
  const parsed = boundary.safeParse(value);
  if (!parsed.success) throw new Error("This is not a supported financial-master draft (schema version 1). The current draft was not changed.");
  const master = parsed.data;
  const ids = new Set<string>();
  let count = 0;
  for (const section of SECTION_KEYS) {
    const allowed = fieldsFor(section).map(f => f.key);
    for (const row of master.sections[section]) {
      count++;
      if (ids.has(row.id)) throw new Error("Duplicate row IDs in financial master.");
      ids.add(row.id);
      if (Object.keys(row.values).some(key => !allowed.includes(key))) throw new Error(`Unknown field in ${SECTIONS[section].title}.`);
      for (const key of allowed) row.values[key] ??= "";
    }
  }
  if (count > 10_000) throw new Error("Financial master exceeds the safe limit of 10,000 rows.");
  return master;
}
