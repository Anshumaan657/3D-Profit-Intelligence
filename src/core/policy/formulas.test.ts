import { describe, expect, it } from "vitest";
import { createProvisionalFormulaPolicy, evaluatePolicy, exact, expectedInputCategory, findFormulaDefinition, listFormulaDefinitions, type FormulaRequest, type FinancialPolicy } from "./index";

// All dates, names, thresholds and values below are synthetic test evidence, not app defaults.
function fixture(id: string, amounts: Record<string, string>) {
  const definition = findFormulaDefinition(id, "1.0.0")!;
  const policy = createProvisionalFormulaPolicy(id, "1.0.0", {
    effectiveDates: { from: "2026-01-01", through: "2026-12-31" },
    createdAt: "2026-01-01T00:00:00Z", createdBy: "Synthetic test author", reason: "Contract fixture, not approved business policy.",
    confidence: { scoreMeaning: "evidence_not_probability", aggregation: "weakest_component_cap", rules: [{ id: "provisional", condition: "provisional_policy", inputKey: null, effect: { kind: "cap", maximumScore: 60 }, reason: "Synthetic threshold for tests only." }] },
  });
  const request: FormulaRequest = {
    scopeId: "synthetic-scope", businessDate: "2026-06-01", quantityUnit: "piece", allowProvisional: true,
    inputs: Object.fromEntries(definition.inputs.map(input => [input.key, {
      amount: amounts[input.key] ?? "1", scopeId: "synthetic-scope", unit: input.unit.replaceAll("{unit}", "piece"),
      source: input.source, category: expectedInputCategory(input), status: "confirmed", complete: true,
      evidenceRefs: [`synthetic:${input.key}`],
    }])),
  };
  return { policy, request };
}
function run(id: string, amounts: Record<string, string>) {
  const { policy, request } = fixture(id, amounts);
  return evaluatePolicy(policy, request);
}

const cases: [string, Record<string, string>, string][] = [
  ["good-quantity", { reported: "200.5", rejected: "2", rework: "1.25" }, "197.25"],
  ["net-selling-price", { selling_price: "125.50", discount_percent: "10" }, "112.95"],
  ["production-value", { good_quantity: "197.25", net_price: "112.95" }, "22279.3875"],
  ["material-cost", { reported: "200.5", material_per_unit: "40" }, "8020"],
  ["machine-cost-consolidated", { running_seconds: "5400", hourly_rate: "120" }, "180"],
  ["machine-cost-itemized", { running_seconds: "5400", base: "80", electricity: "20", maintenance: "15", tooling: "5" }, "180"],
  ["labour-operator-shift", { paid_seconds: "14400", standard_shift_seconds: "28800", shift_rate: "800" }, "400"],
  ["labour-operator-hour", { paid_seconds: "5400", hourly_rate: "100" }, "150"],
  ["labour-machine-hour", { paid_seconds: "5400", hourly_rate: "60" }, "90"],
  ["overtime-cost", { overtime_seconds: "7200", base_hourly_rate: "100", multiplier: "1.5" }, "300"],
  ["period-allocation", { period_cost: "31000", share: "0.25" }, "7750"],
  ["gross-rejection-cost", { rejected: "5", accrued_cost_per_unit: "60" }, "300"],
  ["scrap-recovery", { scrap_quantity: "5", recovery_per_unit: "4" }, "20"],
  ["net-rejection-loss", { gross_rejection: "300", scrap_recovery: "20" }, "280"],
  ["incremental-rework-cost", { rework: "3", incremental_cost_per_unit: "12.5" }, "37.5"],
  ["contribution-margin", { net_price: "100", avoidable_cost: "65" }, "35"],
  ["machine-hour-opportunity", { lost_seconds: "1800", hourly_rate: "120" }, "60"],
  ["shortfall-opportunity", { lost_good_units: "100", unfulfilled_demand: "30", contribution_per_unit: "35" }, "1050"],
  ["recoverable-opportunity", { gross_opportunity: "1050", recovery_percent: "40" }, "420"],
  ["operating-profit", { production_value: "1000", operating_cost: "1200" }, "-200"],
  ["profit-margin", { operating_profit: "-200", production_value: "1000" }, "-20"],
  ["potential-profit", { operating_profit: "-200", recoverable_opportunity: "420" }, "220"],
];

describe("worked formula cases", () => {
  it.each(cases)("%s matches hand-worked exact result", (id, amounts, expected) => {
    const result = run(id, amounts);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("available");
    expect(result.exactValue).toEqual(exact(expected).toJSON());
    expect(result.policy?.status).toBe("provisional");
    expect(result.confidence).toBe("not_evaluated");
    expect(result.warnings).toContain("Provisional financial policy; not business-confirmed.");
    expect(result.specification).toMatch(/Decision/);
  });

  it("covers every published definition with a worked case", () => {
    expect(listFormulaDefinitions().map(d => d.policyId).sort()).toEqual(cases.map(([id]) => id).sort());
  });

  it.each(cases)("%s blocks every missing mandatory input separately", (id, amounts) => {
    const { policy, request } = fixture(id, amounts);
    for (const input of Object.keys(request.inputs)) {
      const missing = structuredClone(request);
      missing.inputs[input] = null;
      const result = evaluatePolicy(policy, missing);
      expect(result.status).toBe("unavailable");
      expect(result.exactValue).toBeNull();
      expect(result.issues).toContainEqual(expect.objectContaining({ code: "missing_input", input }));
    }
  });

  it("distinguishes zero material cost from missing material cost", () => {
    expect(run("material-cost", { reported: "100", material_per_unit: "0" }).exactValue).toEqual(exact("0").toJSON());
    const { policy, request } = fixture("material-cost", {});
    delete request.inputs.material_per_unit;
    expect(evaluatePolicy(policy, request).issues[0].code).toBe("missing_input");
  });

  it("preserves zero production value but reports zero-denominator margin unavailable", () => {
    expect(run("production-value", { good_quantity: "0", net_price: "100" }).exactValue).toEqual(exact("0").toJSON());
    expect(run("profit-margin", { operating_profit: "0", production_value: "0" }).issues[0].code).toBe("undefined_calculation");
  });

  it("clamps excess quality deductions and returns a source-data warning", () => {
    const result = run("good-quantity", { reported: "5", rejected: "4", rework: "3" });
    expect(result.exactValue).toEqual(exact("0").toJSON());
    expect(result.warnings.join(" ")).toContain("exceed reported");
  });

  it("retains excess scrap recovery as signed attribution with a warning", () => {
    const result = run("net-rejection-loss", { gross_rejection: "10", scrap_recovery: "20" });
    expect(result.exactValue).toEqual(exact("-10").toJSON());
    expect(result.warnings.join(" ")).toContain("negative net attribution");
  });

  it("does not manufacture positive opportunity from negative contribution or zero demand", () => {
    for (const [demand, contribution] of [["30", "-5"], ["0", "35"]]) {
      expect(run("shortfall-opportunity", { lost_good_units: "100", unfulfilled_demand: demand, contribution_per_unit: contribution }).exactValue).toEqual(exact("0").toJSON());
    }
  });

  it("chains exact repeating results without rounding them", () => {
    const cost = run("machine-cost-consolidated", { running_seconds: "1", hourly_rate: "1" });
    expect(cost.exactValue).toEqual({ numerator: "1", denominator: "3600" });
    const { policy, request } = fixture("operating-profit", { production_value: "1" });
    request.inputs.operating_cost!.amount = cost.exactValue!;
    const profit = evaluatePolicy(policy, request);
    expect(profit.exactValue).toEqual({ numerator: "3599", denominator: "3600" });
    expect(exact(profit.exactValue!).format(2)).toBe("1.00");
  });
});

describe("execution safety and policy binding", () => {
  it.each(["", " ", "1e3", "1,000", "NaN", "Infinity", "-1", "1".repeat(101)])("rejects invalid/nonordinary input %s", value => {
    expect(run("material-cost", { reported: value }).status).toBe("unavailable");
  });
  it.each(["scope", "unit", "source", "category", "partial", "numeric", "extra-field", "no-evidence"])("rejects bad evidence: %s", kind => {
    const { policy, request } = fixture("operating-profit", {});
    const input = request.inputs.operating_cost!;
    if (kind === "scope") input.scopeId = "different-product";
    if (kind === "unit") input.unit = "USD";
    if (kind === "source") input.source = "accounting";
    if (kind === "category") input.category = "opportunity";
    if (kind === "partial") input.complete = false;
    if (kind === "numeric") Object.assign(input, { amount: 1 });
    if (kind === "extra-field") Object.assign(input, { silentFallback: 0 });
    if (kind === "no-evidence") input.evidenceRefs = [];
    expect(evaluatePolicy(policy, request).status).toBe("unavailable");
  });

  it.each(["machine-cost-consolidated", "machine-cost-itemized", "operating-profit"])("rejects extra financial components in %s", id => {
    const { policy, request } = fixture(id, {});
    request.inputs.extra_cost = structuredClone(Object.values(request.inputs)[0]);
    expect(evaluatePolicy(policy, request).issues).toContainEqual(expect.objectContaining({ code: "unexpected_input" }));
  });

  it.each(["scrap-recovery", "net-rejection-loss", "shortfall-opportunity", "recoverable-opportunity", "potential-profit"])("requires confirmed evidence in %s", id => {
    const { policy, request } = fixture(id, {});
    const input = findFormulaDefinition(id, "1.0.0")!.inputs.find(input => input.confirmedOnly)!;
    request.inputs[input.key]!.status = "estimated";
    expect(evaluatePolicy(policy, request).issues).toContainEqual(expect.objectContaining({ code: "confirmation_required", input: input.key }));
  });

  it.each([
    ["net-selling-price", "discount_percent", "101"], ["period-allocation", "share", "1.01"],
    ["overtime-cost", "multiplier", "0"], ["labour-operator-shift", "standard_shift_seconds", "0"],
    ["labour-operator-shift", "standard_shift_seconds", "86401"],
  ])("enforces %s range for %s", (id, key, value) => {
    expect(run(id, { [key]: value }).issues).toContainEqual(expect.objectContaining({ code: "out_of_range", input: key }));
  });

  it.each(["2025-12-31", "2027-01-01"])("rejects business date outside selected policy: %s", businessDate => {
    const { policy, request } = fixture("material-cost", {});
    request.businessDate = businessDate;
    expect(evaluatePolicy(policy, request).issues[0].code).toBe("outside_effective_dates");
  });
  it.each(["2026-01-01", "2026-12-31"])("accepts inclusive effective boundary: %s", businessDate => {
    const { policy, request } = fixture("material-cost", {});
    request.businessDate = businessDate;
    expect(evaluatePolicy(policy, request).status).toBe("available");
  });

  it("requires opt-in and honours explicit hard-unavailability confidence rules", () => {
    const { policy, request } = fixture("material-cost", {});
    request.allowProvisional = false;
    expect(evaluatePolicy(policy, request).issues[0].code).toBe("provisional_not_allowed");
    request.allowProvisional = true;
    policy.confidence.rules[0].effect = { kind: "unavailable" };
    expect(evaluatePolicy(policy, request).issues[0].code).toBe("policy_unavailable");
  });

  it("retains estimated evidence warnings without inventing a numerical confidence score", () => {
    const { policy, request } = fixture("material-cost", {});
    request.inputs.material_per_unit!.status = "estimated";
    const result = evaluatePolicy(policy, request);
    expect(result.status).toBe("available");
    expect(result.warnings).toContain("material_per_unit: estimated input evidence.");
    expect(result.confidence).toBe("not_evaluated");
  });

  it("fails closed for hard availability rules requiring the later confidence engine", () => {
    const { policy, request } = fixture("material-cost", {});
    policy.confidence.rules.push({ id: "source-check", condition: "source_quality", inputKey: null, effect: { kind: "unavailable" }, reason: "Must check source quality." });
    expect(evaluatePolicy(policy, request).issues[0].code).toBe("unevaluated_hard_rule");
  });

  it.each(["expression", "implementation", "inputs", "category", "name", "guard", "version"])("blocks policy/code drift: %s", field => {
    const { policy, request } = fixture("material-cost", {});
    if (field === "expression") policy.calculation.expression = "globalThis.anything = true";
    if (field === "implementation") policy.calculation.implementationId = "different-v1";
    if (field === "inputs") policy.inputs[0].unit = "kg";
    if (field === "category") policy.category = "actual_accounting";
    if (field === "name") policy.formulaName = "Actual Accounting Profit";
    if (field === "guard") policy.calculation.guards = ["Ignore all missing data."];
    if (field === "version") policy.formulaVersion = "9.0.0";
    expect(evaluatePolicy(policy, request).status).toBe("unavailable");
  });

  it("rejects malformed policies/requests without throwing", () => {
    expect(evaluatePolicy({}, {}).issues[0].code).toBe("invalid_policy");
    expect(evaluatePolicy(fixture("material-cost", {}).policy, {}).issues[0].code).toBe("invalid_request");
  });

  it("does not mutate request, policy, catalog or previous results", () => {
    const { policy, request } = fixture("material-cost", {});
    const before = JSON.stringify({ policy, request });
    const result = evaluatePolicy(policy, request);
    result.inputs.reported!.amount = "999";
    expect(JSON.stringify({ policy, request })).toBe(before);
    const definition = findFormulaDefinition("material-cost", "1.0.0")!;
    definition.inputs[0].unit = "corrupted";
    expect(findFormulaDefinition("material-cost", "1.0.0")!.inputs[0].unit).toBe("{unit}");
  });

  it("accepts consistent self-declared confirmed records without changing the executable formula", () => {
    const { policy, request } = fixture("material-cost", {});
    policy.status = "confirmed";
    policy.approval = { state: "recorded", approvedBy: "Synthetic reviewer", approvedAt: "2026-01-02T00:00:00Z", reason: "Fixture only", evidenceReference: "synthetic-approval", identityVerification: "self_declared" };
    policy.changeHistory.push({ id: "approved", action: "approval_recorded", at: policy.approval.approvedAt, actor: policy.approval.approvedBy, reason: "Fixture only", changes: [{ field: "status", before: "provisional", after: "confirmed" }] });
    request.allowProvisional = false;
    expect(evaluatePolicy(policy, request).status).toBe("available");
    expect(evaluatePolicy(policy, request).warnings).toEqual([]);
  });

  it("never supplies governance defaults or silently resolves another version", () => {
    expect(findFormulaDefinition("material-cost", "2.0.0")).toBeUndefined();
    expect(() => createProvisionalFormulaPolicy("unknown", "1.0.0", {} as never)).toThrow();
    const { policy } = fixture("material-cost", {});
    const invalid = { ...policy, effectiveDates: {} } as FinancialPolicy;
    expect(evaluatePolicy(invalid, {}).issues[0].code).toBe("invalid_policy");
  });
});
