import { z } from "zod";

// Policies are serializable descriptions, never executable user-supplied code.
const text = z.string().trim().min(1).max(2000);
const identifier = z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/).max(100);
const version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/).max(50);
const date = z.iso.date();
const timestamp = z.iso.datetime();
const score = z.number().int().min(0).max(100);

const inputSchema = z.object({
  key: identifier,
  name: text,
  unit: text,
  source: z.enum(["mms", "financial_master", "derived", "accounting", "demand"]),
  required: z.boolean(),
  missingBehavior: z.enum(["unavailable", "reduce_confidence"]),
  description: text,
}).strict().superRefine((input, ctx) => {
  if (input.required && input.missingBehavior !== "unavailable") {
    ctx.addIssue({ code: "custom", path: ["missingBehavior"], message: "Missing mandatory inputs must make the dependent result unavailable." });
  }
});

const approvalSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending"), reason: text }).strict(),
  z.object({
    state: z.literal("recorded"),
    approvedBy: text,
    approvedAt: timestamp,
    reason: text,
    evidenceReference: text,
    identityVerification: z.literal("self_declared"),
  }).strict(),
]);

const confidenceRuleSchema = z.object({
  id: identifier,
  condition: z.enum(["missing_input", "estimated_input", "provisional_input", "provisional_policy", "source_quality", "mapping_quality", "formula_reliability"]),
  inputKey: identifier.nullable(),
  effect: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unavailable") }).strict(),
    z.object({ kind: z.literal("cap"), maximumScore: score }).strict(),
  ]),
  reason: text,
}).strict();

const historySchema = z.object({
  id: identifier,
  action: z.enum(["created", "revised", "approval_recorded"]),
  at: timestamp,
  actor: text,
  reason: text,
  changes: z.array(z.object({ field: text, before: z.string().max(4000).nullable(), after: z.string().max(4000).nullable() }).strict()).max(100),
}).strict();

export const policySchema = z.object({
  schemaVersion: z.literal(1),
  policyId: identifier,
  formulaName: text,
  formulaVersion: version,
  status: z.enum(["provisional", "confirmed"]),
  category: z.enum(["production", "estimated_operational", "actual_accounting", "opportunity", "scenario"]),
  description: text,
  inputs: z.array(inputSchema).min(1).max(100),
  calculation: z.object({
    implementationId: identifier,
    expression: text,
    explanation: text,
    outputUnit: text,
    rounding: z.literal("display_only"),
    guards: z.array(text).min(1).max(100),
  }).strict(),
  effectiveDates: z.object({ from: date, through: date.nullable() }).strict(),
  approval: approvalSchema,
  confidence: z.object({
    scoreMeaning: z.literal("evidence_not_probability"),
    aggregation: z.literal("weakest_component_cap"),
    bands: z.object({ high: score, medium: score, low: score }).strict().refine(bands => bands.high > bands.medium && bands.medium > bands.low && bands.low > 0, "Confidence bands must satisfy high > medium > low > 0.").optional(),
    rules: z.array(confidenceRuleSchema).min(1).max(100),
  }).strict(),
  supersedesVersion: version.nullable(),
  changeHistory: z.array(historySchema).min(1).max(1000),
}).strict().superRefine((policy, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (policy.effectiveDates.through && policy.effectiveDates.through < policy.effectiveDates.from) {
    issue(["effectiveDates", "through"], "The inclusive end date cannot precede the start date.");
  }
  if ((policy.status === "confirmed") !== (policy.approval.state === "recorded")) {
    issue(["approval"], "Confirmed policies require recorded approval; provisional policies require pending approval.");
  }
  if (policy.supersedesVersion === policy.formulaVersion) {
    issue(["supersedesVersion"], "A version cannot supersede itself.");
  }
  const inputKeys = new Set<string>();
  policy.inputs.forEach((input, index) => {
    if (inputKeys.has(input.key)) issue(["inputs", index, "key"], "Duplicate input key.");
    inputKeys.add(input.key);
  });
  const ruleIds = new Set<string>();
  policy.confidence.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) issue(["confidence", "rules", index, "id"], "Duplicate confidence rule ID.");
    ruleIds.add(rule.id);
    const inputCondition = ["missing_input", "estimated_input", "provisional_input"].includes(rule.condition);
    if (inputCondition ? !rule.inputKey || !inputKeys.has(rule.inputKey) : rule.inputKey !== null) {
      issue(["confidence", "rules", index, "inputKey"], "Input conditions require a declared input; other conditions must not name an input.");
    }
    if (rule.condition === "missing_input" && policy.inputs.some(input => input.key === rule.inputKey && input.required) && rule.effect.kind !== "unavailable") {
      issue(["confidence", "rules", index, "effect"], "Missing mandatory inputs cannot be downgraded to a score penalty.");
    }
    if (rule.effect.kind === "cap" && rule.effect.maximumScore === 100) {
      issue(["confidence", "rules", index, "effect"], "A confidence reduction must cap the score below 100.");
    }
  });
  if (!policy.confidence.rules.some(rule => rule.condition === "provisional_policy")) {
    issue(["confidence", "rules"], "Record how provisional policy status limits confidence.");
  }
  const historyIds = new Set<string>();
  policy.changeHistory.forEach((event, index) => {
    if (historyIds.has(event.id)) issue(["changeHistory", index, "id"], "Duplicate history event ID.");
    historyIds.add(event.id);
    if ((index === 0) !== (event.action === "created")) {
      issue(["changeHistory", index, "action"], "History must start with exactly one creation event.");
    }
    if (index > 0 && Date.parse(event.at) < Date.parse(policy.changeHistory[index - 1].at)) {
      issue(["changeHistory", index, "at"], "History must be chronological.");
    }
    if (event.action === "revised" && event.changes.length === 0) {
      issue(["changeHistory", index, "changes"], "A revision must describe its changes.");
    }
    if (event.changes.some(change => change.before === change.after)) {
      issue(["changeHistory", index, "changes"], "A recorded change must have different before and after values.");
    }
  });
  const approvals = policy.changeHistory.filter(event => event.action === "approval_recorded");
  if (policy.approval.state === "recorded") {
    const approval = policy.approval;
    const event = policy.changeHistory.at(-1);
    if (approvals.length !== 1 || event?.action !== "approval_recorded" || event.actor !== approval.approvedBy || Date.parse(event.at) !== Date.parse(approval.approvedAt)) {
      issue(["changeHistory"], "Recorded approval must match the final history event's approver and timestamp.");
    }
  } else if (approvals.length) {
    issue(["changeHistory"], "Pending approval cannot contain an approval-recorded event.");
  }
});

export type FinancialPolicy = z.infer<typeof policySchema>;
export type PolicyStatus = FinancialPolicy["status"];
export type PolicyReference = Readonly<Pick<FinancialPolicy, "policyId" | "formulaVersion">>;
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Validates and detaches a policy from caller-owned data. Does not approve or execute it. */
export function parsePolicy(value: unknown): FinancialPolicy {
  return policySchema.parse(value);
}
