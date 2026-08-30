import { z } from "zod";
import { exact, type Exact, type ExactValue } from "./exact";
import { findFormulaDefinition, runBoundFormula, type FormulaDefinition } from "./formulas";
import { parsePolicy, type FinancialPolicy } from "./schema";

export type PolicyGovernance = Pick<FinancialPolicy, "effectiveDates" | "confidence"> & { createdAt: string; createdBy: string; reason: string };
const policyInputs = (definition: FormulaDefinition): FinancialPolicy["inputs"] => definition.inputs.map(input => ({
  key: input.key, name: input.name, unit: input.unit, source: input.source, required: input.required,
  missingBehavior: input.missingBehavior, description: input.description,
}));

/** No dates, approvers or confidence thresholds are invented. Publication follows in 4.3. */
export function createProvisionalFormulaPolicy(policyId: string, formulaVersion: string, governance: PolicyGovernance): FinancialPolicy {
  const definition = findFormulaDefinition(policyId, formulaVersion);
  if (!definition) throw new Error("Unknown formula version.");
  return parsePolicy({
    schemaVersion: 1, policyId, formulaVersion, formulaName: definition.formulaName,
    category: definition.category, description: definition.description,
    status: "provisional", inputs: policyInputs(definition), calculation: definition.calculation,
    effectiveDates: governance.effectiveDates,
    confidence: governance.confidence,
    approval: { state: "pending", reason: governance.reason }, supersedesVersion: null,
    changeHistory: [{ id: "created", action: "created", actor: governance.createdBy, at: governance.createdAt, reason: governance.reason, changes: [] }],
  });
}

const category = z.enum(["production", "estimated_operational", "actual_accounting", "opportunity", "scenario", "configuration"]);
const amountSchema = z.union([
  z.string().max(102),
  z.object({ numerator: z.string().max(1001), denominator: z.string().max(1000) }).strict(),
]);
const evidenceSchema = z.object({
  amount: amountSchema,
  scopeId: z.string().trim().min(1).max(200),
  unit: z.string().min(1).max(100),
  source: z.enum(["mms", "financial_master", "derived", "accounting", "demand"]),
  category,
  status: z.enum(["confirmed", "estimated", "provisional"]),
  complete: z.boolean(),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
}).strict();
export type FormulaEvidence = z.infer<typeof evidenceSchema>;
const requestSchema = z.object({
  businessDate: z.iso.date(),
  // Explicit per-product context prevents adding kg to pieces or mixing products.
  scopeId: z.string().trim().min(1).max(200),
  quantityUnit: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  allowProvisional: z.boolean(),
  inputs: z.record(z.string().max(100), evidenceSchema.nullable()).refine(inputs => Object.keys(inputs).length <= 100),
}).strict();
export type FormulaRequest = z.infer<typeof requestSchema>;
export type FormulaIssue = { code: string; input?: string; message: string };
export type FormulaResult = {
  status: "available" | "unavailable";
  exactValue: ExactValue | null;
  unit: string | null;
  category: FinancialPolicy["category"] | null;
  policy: { policyId: string; formulaVersion: string; implementationId: string; status: FinancialPolicy["status"] } | null;
  businessDate: string | null;
  scopeId: string | null;
  inputs: Record<string, FormulaEvidence | null>;
  expression: string | null;
  explanation: string | null;
  specification: string | null;
  issues: FormulaIssue[];
  warnings: string[];
  confidence: "not_evaluated";
};
const resolveUnit = (template: string, unit: string) => template.replaceAll("{unit}", unit);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(",") + "}";
  return JSON.stringify(value);
}

export function expectedInputCategory(input: FormulaDefinition["inputs"][number]): FormulaEvidence["category"] {
  if (input.source === "financial_master") return "configuration";
  if (input.source === "accounting") return "actual_accounting";
  if (["gross_opportunity", "recoverable_opportunity"].includes(input.key)) return "opportunity";
  if (input.unit.startsWith("INR")) return "estimated_operational";
  return "production";
}

/** Pure, strict execution boundary. Callers must resolve provenance and dates before calling. */
export function evaluatePolicy(policyValue: unknown, requestValue: unknown): FormulaResult {
  const result: FormulaResult = { status: "unavailable", exactValue: null, unit: null, category: null, policy: null, businessDate: null, scopeId: null, inputs: {}, expression: null, explanation: null, specification: null, issues: [], warnings: [], confidence: "not_evaluated" };
  const issue = (code: string, message: string, input?: string) => result.issues.push({ code, message, ...(input ? { input } : {}) });
  let policy: FinancialPolicy;
  try { policy = parsePolicy(policyValue); } catch { issue("invalid_policy", "Policy record is invalid; no calculation was performed."); return result; }
  result.policy = { policyId: policy.policyId, formulaVersion: policy.formulaVersion, implementationId: policy.calculation.implementationId, status: policy.status };
  const definition = findFormulaDefinition(policy.policyId, policy.formulaVersion);
  if (!definition) { issue("unknown_formula", "No implementation exists for this exact policy/version."); return result; }
  if (policy.formulaName !== definition.formulaName || policy.category !== definition.category ||
    canonical(policy.inputs) !== canonical(policyInputs(definition)) || canonical(policy.calculation) !== canonical(definition.calculation)) {
    issue("contract_mismatch", "The policy differs from its executable formula contract. A changed formula requires a new implemented version."); return result;
  }
  const parsed = requestSchema.safeParse(requestValue);
  if (!parsed.success) { issue("invalid_request", "Provide valid dates, scope, units and complete typed input evidence; numeric amounts must be decimal strings or exact fractions."); return result; }
  const request = parsed.data;
  result.businessDate = request.businessDate; result.scopeId = request.scopeId;
  result.category = policy.category; result.unit = resolveUnit(definition.calculation.outputUnit, request.quantityUnit);
  result.expression = definition.calculation.expression; result.explanation = definition.calculation.explanation;
  result.specification = definition.specification; result.inputs = request.inputs;
  if (request.businessDate < policy.effectiveDates.from || policy.effectiveDates.through !== null && request.businessDate > policy.effectiveDates.through) {
    issue("outside_effective_dates", "This explicitly selected policy does not cover the business date.");
  }
  if (policy.status === "provisional") {
    result.warnings.push("Provisional financial policy; not business-confirmed.");
    if (!request.allowProvisional) issue("provisional_not_allowed", "Explicit provisional-policy opt-in is required.");
  }
  const values: Record<string, Exact> = Object.create(null);
  for (const key of Object.keys(request.inputs)) {
    if (!definition.inputs.some(input => input.key === key)) issue("unexpected_input", "Unexpected input: alternate rates, GST, opportunity losses and other amounts cannot be silently included.", key);
  }
  for (const input of definition.inputs) {
    const evidence = request.inputs[input.key];
    if (!evidence) { issue("missing_input", "Required input is unavailable; zero was not assumed.", input.key); continue; }
    if (!evidence.complete) issue("partial_input", "A partial or unreliable input cannot be treated as a complete result.", input.key);
    if (evidence.scopeId !== request.scopeId) issue("scope_mismatch", "Inputs must refer to the same product/assignment/analysis scope.", input.key);
    if (evidence.source !== input.source || evidence.category !== expectedInputCategory(input)) issue("source_mismatch", "Input source or financial category does not match this formula.", input.key);
    if (evidence.unit !== resolveUnit(input.unit, request.quantityUnit)) issue("unit_mismatch", "Input units do not match; resolve approved conversions first.", input.key);
    if (input.confirmedOnly && evidence.status !== "confirmed") issue("confirmation_required", "This input requires confirmed evidence.", input.key);
    if (evidence.status !== "confirmed") result.warnings.push(`${input.key}: ${evidence.status} input evidence.`);
    try {
      const value = exact(evidence.amount);
      if (input.minimum !== null && value.compare(exact(input.minimum)) < 0 || input.maximum !== null && value.compare(exact(input.maximum)) > 0 || input.positive && value.compare(exact("0")) <= 0) {
        issue("out_of_range", "Input is outside this formula's permitted range.", input.key);
      } else values[input.key] = value;
    } catch { issue("invalid_amount", "Input is not a supported exact decimal/fraction or exceeds precision limits.", input.key); }
  }
  // Honour explicit hard-unavailability rules now; numerical scoring belongs to 4.4.
  for (const rule of policy.confidence.rules) {
    if (rule.effect.kind === "unavailable" && ["source_quality", "mapping_quality", "formula_reliability"].includes(rule.condition)) {
      issue("unevaluated_hard_rule", "This policy requires a quality/reliability availability check that is not yet implemented; execution is blocked.");
    }
    const evidence = rule.inputKey ? request.inputs[rule.inputKey] : undefined;
    const triggered = rule.condition === "provisional_policy" && policy.status === "provisional" ||
      rule.condition === "missing_input" && !evidence ||
      rule.condition === "estimated_input" && evidence?.status === "estimated" ||
      rule.condition === "provisional_input" && evidence?.status === "provisional";
    if (triggered && rule.effect.kind === "unavailable") issue("policy_unavailable", rule.reason, rule.inputKey ?? undefined);
  }
  if (result.issues.length) return result;
  try {
    const computed = runBoundFormula(policy.policyId, policy.formulaVersion, values);
    result.status = "available"; result.exactValue = computed.value.toJSON();
    result.warnings.push(...computed.warnings);
  } catch {
    issue("undefined_calculation", "Calculation is undefined (for example, division by zero) or exceeds the exact-arithmetic safety limit.");
  }
  return result;
}
