import { describe, expect, it } from "vitest";
import { createPolicyRegistry, parsePolicy, type FinancialPolicy } from "./index";

// Synthetic contract fixture only. Not an approved formula or a factory default.
function fixture(): FinancialPolicy {
  return {
    schemaVersion: 1,
    policyId: "test.production-value",
    formulaName: "Synthetic production value",
    formulaVersion: "1.0.0",
    status: "provisional",
    category: "estimated_operational",
    description: "Contract test; not a production financial policy.",
    inputs: [
      { key: "quantity", name: "Eligible quantity", unit: "financial_unit", source: "derived", required: true, missingBehavior: "unavailable", description: "Unit conversion must already be resolved." },
      { key: "price", name: "Net price", unit: "INR/financial_unit", source: "financial_master", required: true, missingBehavior: "unavailable", description: "Tax-exclusive price for the business date." },
    ],
    calculation: { implementationId: "test.production-value-v1", expression: "quantity * price", explanation: "Multiply compatible quantity and price.", outputUnit: "INR", rounding: "display_only", guards: ["Both inputs must be available and have compatible units."] },
    effectiveDates: { from: "2026-01-01", through: null },
    approval: { state: "pending", reason: "Synthetic fixture has no business approval." },
    confidence: { scoreMeaning: "evidence_not_probability", aggregation: "weakest_component_cap", rules: [{ id: "provisional-cap", condition: "provisional_policy", inputKey: null, effect: { kind: "cap", maximumScore: 60 }, reason: "Synthetic cap for validation tests; not a recommended threshold." }] },
    supersedesVersion: null,
    changeHistory: [{ id: "created-v1", action: "created", at: "2026-01-01T00:00:00Z", actor: "Synthetic test author", reason: "Create contract fixture.", changes: [] }],
  };
}

function confirmed(): FinancialPolicy {
  const policy = fixture();
  policy.status = "confirmed";
  policy.approval = { state: "recorded", approvedBy: "Synthetic approver", approvedAt: "2026-01-02T00:00:00Z", reason: "Test only", evidenceReference: "test://approval", identityVerification: "self_declared" };
  policy.changeHistory.push({ id: "approval-v1", action: "approval_recorded", at: policy.approval.approvedAt, actor: policy.approval.approvedBy, reason: "Test only", changes: [{ field: "status", before: "provisional", after: "confirmed" }] });
  return policy;
}

describe("policy record boundary", () => {
  it("round-trips complete serializable provisional records without mutating input", () => {
    const source = fixture();
    const result = parsePolicy(JSON.parse(JSON.stringify(source)));
    expect(result).toEqual(source);
    result.inputs[0].name = "Detached";
    expect(source.inputs[0].name).toBe("Eligible quantity");
  });

  it("accepts recorded self-declared approval with matching history", () => {
    expect(parsePolicy(confirmed()).status).toBe("confirmed");
  });

  it.each([
    ["unsupported schema", (p: FinancialPolicy) => ({ ...p, schemaVersion: 2 })],
    ["unknown top-level field", (p: FinancialPolicy) => ({ ...p, unexpected: true })],
    ["unknown nested field", (p: FinancialPolicy) => ({ ...p, calculation: { ...p.calculation, executable: true } })],
    ["blank name", (p: FinancialPolicy) => ({ ...p, formulaName: "  " })],
    ["invalid identifier", (p: FinancialPolicy) => ({ ...p, policyId: "Bad ID" })],
    ["incomplete version", (p: FinancialPolicy) => ({ ...p, formulaVersion: "1.0" })],
    ["version leading zeros", (p: FinancialPolicy) => ({ ...p, formulaVersion: "01.0.0" })],
    ["unknown status", (p: FinancialPolicy) => ({ ...p, status: "approved" })],
    ["impossible date", (p: FinancialPolicy) => ({ ...p, effectiveDates: { from: "2026-02-30", through: null } })],
    ["reversed dates", (p: FinancialPolicy) => ({ ...p, effectiveDates: { from: "2026-02-01", through: "2026-01-31" } })],
    ["confirmation without evidence", (p: FinancialPolicy) => ({ ...p, status: "confirmed" })],
    ["self-supersession", (p: FinancialPolicy) => ({ ...p, supersedesVersion: p.formulaVersion })],
    ["empty inputs", (p: FinancialPolicy) => ({ ...p, inputs: [] })],
    ["duplicate inputs", (p: FinancialPolicy) => ({ ...p, inputs: [p.inputs[0], p.inputs[0]] })],
    ["silent mandatory fallback", (p: FinancialPolicy) => ({ ...p, inputs: [{ ...p.inputs[0], missingBehavior: "reduce_confidence" }] })],
    ["calculation function", (p: FinancialPolicy) => ({ ...p, calculation: { ...p.calculation, expression: () => 0 } })],
    ["intermediate rounding", (p: FinancialPolicy) => ({ ...p, calculation: { ...p.calculation, rounding: "per_row" } })],
    ["no history", (p: FinancialPolicy) => ({ ...p, changeHistory: [] })],
    ["no confidence rules", (p: FinancialPolicy) => ({ ...p, confidence: { ...p.confidence, rules: [] } })],
    ["probabilistic score claim", (p: FinancialPolicy) => ({ ...p, confidence: { ...p.confidence, scoreMeaning: "probability" } })],
  ])("rejects %s", (_name, change) => {
    expect(() => parsePolicy(change(fixture()))).toThrow();
  });

  it("accepts a leap date and inclusive single-day policy", () => {
    const p = fixture();
    p.effectiveDates = { from: "2028-02-29", through: "2028-02-29" };
    expect(parsePolicy(p).effectiveDates).toEqual(p.effectiveDates);
  });

  it.each([-1, 100, 101, 50.5, Infinity, NaN])("rejects invalid confidence cap %s", maximumScore => {
    const p = fixture();
    p.confidence.rules[0].effect = { kind: "cap", maximumScore };
    expect(() => parsePolicy(p)).toThrow();
  });

  it("accepts a zero cap without replacing it by a default", () => {
    const p = fixture();
    p.confidence.rules[0].effect = { kind: "cap", maximumScore: 0 };
    expect(parsePolicy(p).confidence.rules[0].effect).toEqual({ kind: "cap", maximumScore: 0 });
  });

  it("checks confidence input references, unique rules, and mandatory availability", () => {
    const p = fixture();
    p.confidence.rules.push({ id: "missing-price", condition: "missing_input", inputKey: "unknown", effect: { kind: "unavailable" }, reason: "Price is required." });
    expect(() => parsePolicy(p)).toThrow();
    p.confidence.rules[1].inputKey = "price";
    expect(() => parsePolicy(p)).not.toThrow();
    p.confidence.rules[1].effect = { kind: "cap", maximumScore: 20 };
    expect(() => parsePolicy(p)).toThrow();
    p.confidence.rules[1].effect = { kind: "unavailable" };
    p.confidence.rules[1].id = p.confidence.rules[0].id;
    expect(() => parsePolicy(p)).toThrow();
  });

  it("rejects input keys on policy-wide confidence conditions", () => {
    const p = fixture();
    p.confidence.rules[0].inputKey = "quantity";
    expect(() => parsePolicy(p)).toThrow();
  });

  it("requires a provisional-policy rule even on a confirmed record", () => {
    const p = confirmed();
    p.confidence.rules[0].condition = "formula_reliability";
    expect(() => parsePolicy(p)).toThrow();
  });

  it("requires creation first, chronological history and actual revision changes", () => {
    const p = fixture();
    p.changeHistory.push({ id: "revision-v1", action: "revised", at: "2025-12-01T00:00:00Z", actor: "Synthetic author", reason: "Update explanation", changes: [] });
    expect(() => parsePolicy(p)).toThrow();
    p.changeHistory[1].at = "2026-01-02T00:00:00Z";
    expect(() => parsePolicy(p)).toThrow();
    p.changeHistory[1].changes = [{ field: "description", before: "Old", after: "New" }];
    expect(() => parsePolicy(p)).not.toThrow();
    p.changeHistory[1].changes[0].after = "Old";
    expect(() => parsePolicy(p)).toThrow();
  });

  it.each(["actor", "timestamp", "evidence", "pending", "identity", "after-approval", "duplicate-history", "second-creation"])("rejects inconsistent approval/history: %s", kind => {
    const p = confirmed();
    if (p.approval.state !== "recorded") throw new Error("Bad fixture");
    if (kind === "actor") p.changeHistory[1].actor = "Someone else";
    if (kind === "timestamp") p.approval.approvedAt = "2026-01-03T00:00:00Z";
    if (kind === "evidence") p.approval.evidenceReference = " ";
    if (kind === "pending") { p.status = "provisional"; p.approval = { state: "pending", reason: "Waiting" }; }
    if (kind === "identity") Object.assign(p.approval, { identityVerification: "authenticated" });
    if (kind === "after-approval") p.changeHistory.push({ id: "late-edit", action: "revised", actor: "Editor", at: "2026-01-03T00:00:00Z", reason: "Late edit", changes: [{ field: "description", before: "a", after: "b" }] });
    if (kind === "duplicate-history") p.changeHistory[1].id = p.changeHistory[0].id;
    if (kind === "second-creation") p.changeHistory[1].action = "created";
    expect(() => parsePolicy(p)).toThrow();
  });

  it("keeps expression text inert", () => {
    const p = fixture();
    p.calculation.expression = "throw new Error('must never execute')";
    expect(parsePolicy(p).calculation.expression).toBe(p.calculation.expression);
  });
});

describe("explicit-version registry", () => {
  it("starts empty without invented or confirmed default policies", () => {
    expect(createPolicyRegistry([]).size).toBe(0);
  });

  it("looks up exact versions and never falls back to latest", () => {
    const first = fixture();
    const second = { ...fixture(), formulaVersion: "2.0.0", supersedesVersion: "1.0.0" };
    const registry = createPolicyRegistry([first, second]);
    expect(registry.size).toBe(2);
    expect(registry.list(first.policyId)).toHaveLength(2);
    expect(registry.list("not-found")).toEqual([]);
    expect(registry.get({ policyId: first.policyId, formulaVersion: "1.0.0" })?.formulaVersion).toBe("1.0.0");
    expect(registry.get({ policyId: first.policyId, formulaVersion: "3.0.0" })).toBeUndefined();
  });

  it("rejects duplicate versions and invalid records", () => {
    expect(() => createPolicyRegistry([fixture(), fixture()])).toThrow("Duplicate policy version");
    expect(() => createPolicyRegistry([{}])).toThrow();
    expect(() => createPolicyRegistry(Array(10_001).fill(null))).toThrow("10,000");
  });

  it("isolates callers and deeply freezes records, lists and the API", () => {
    const source = fixture();
    const registry = createPolicyRegistry([source]);
    source.inputs[0].name = "Changed by caller";
    const record = registry.get(source)!;
    expect(record.inputs[0].name).toBe("Eligible quantity");
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.list(source.policyId))).toBe(true);
    expect(Object.isFrozen(record.changeHistory[0].changes)).toBe(true);
    expect(() => Object.assign(record.inputs[0], { name: "Mutation" })).toThrow();
    expect(() => Object.assign(record, { status: "confirmed" })).toThrow();
  });
});
