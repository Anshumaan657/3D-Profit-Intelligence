import { exact, type Exact } from "./exact";
import type { FinancialPolicy } from "./schema";

export type FormulaInput = FinancialPolicy["inputs"][number] & {
  minimum: string | null;
  maximum: string | null;
  positive: boolean;
  confirmedOnly: boolean;
};
export type FormulaDefinition = {
  policyId: string;
  formulaVersion: "1.0.0";
  formulaName: string;
  category: FinancialPolicy["category"];
  description: string;
  specification: string;
  inputs: FormulaInput[];
  calculation: FinancialPolicy["calculation"];
};
type Values = Record<string, Exact>;
type Implementation = { definition: FormulaDefinition; run: (values: Values) => Exact; warnings?: (values: Values) => string[] };
const zero = exact("0");
const hundred = exact("100");
const hours = (seconds: Exact) => seconds.div(exact("3600"));
const sum = (...values: Exact[]) => values.reduce((total, value) => total.add(value), zero);

function input(key: string, unit: string, source: FormulaInput["source"], description: string, options: Partial<Pick<FormulaInput, "minimum" | "maximum" | "positive" | "confirmedOnly">> = {}): FormulaInput {
  return { key, name: key.replaceAll("_", " "), unit, source, description, required: true, missingBehavior: "unavailable", minimum: "0", maximum: null, positive: false, confirmedOnly: false, ...options };
}
const qty = (key: string, source: FormulaInput["source"] = "derived") => input(key, "{unit}", source, "Quantity for the same product and resolved financial unit.");
const rate = (key: string) => input(key, "INR/{unit}", "financial_master", "Tax-exclusive per-unit rate; explicit zero is permitted.");
const seconds = (key: string) => input(key, "second", "derived", "Eligible duration in seconds, excluding duplicate or unclassified intervals.");
const money = (key: string, description: string, signed = false) => input(key, "INR", "derived", description, { minimum: signed ? null : "0" });
const percent = (key: string, confirmedOnly = false) => input(key, "percent", "financial_master", "Explicit percentage, not a decimal fraction.", { maximum: "100", confirmedOnly });
const implementationList: Implementation[] = [];

function define(id: string, name: string, category: FormulaDefinition["category"], specification: string, inputs: FormulaInput[], expression: string, explanation: string, outputUnit: string, guards: string[], run: Implementation["run"], warnings?: Implementation["warnings"]) {
  implementationList.push({ definition: {
    policyId: id, formulaVersion: "1.0.0", formulaName: name, category, description: explanation, specification,
    inputs, calculation: { implementationId: `${id}-v1`, expression, explanation, outputUnit, rounding: "display_only", guards },
  }, run, warnings });
}

define("good-quantity", "Good Production Quantity", "production", "Decisions 49–50; MMS direct-quantity policy", [qty("reported", "mms"), qty("rejected", "mms"), qty("rework", "mms")],
  "max(0, reported - rejected - rework)", "Reported quantity is authoritative. Scrap and Stroke × M.Factor do not enter this calculation.", "{unit}", ["Missing quality values are not zero.", "Excess quality deductions are clamped to zero and flagged."],
  v => v.reported.sub(v.rejected).sub(v.rework).max(zero), v => v.rejected.add(v.rework).compare(v.reported) > 0 ? ["Quality deductions exceed reported quantity; review source data before financial use."] : []);

define("net-selling-price", "Net Selling Price", "estimated_operational", "Decisions 57–59; Phase 3 discountPercent contract", [rate("selling_price"), percent("discount_percent")],
  "selling_price * (1 - discount_percent / 100)", "Apply an explicit discount to the tax-exclusive price. GST is separate.", "INR/{unit}", ["Unknown discount is unavailable; enter explicit zero if no discount applies."], v => v.selling_price.mul(exact("1").sub(v.discount_percent.div(hundred))));

define("production-value", "Estimated Production Value", "estimated_operational", "Decisions 4, 49–59", [qty("good_quantity"), input("net_price", "INR/{unit}", "derived", "Net selling price for the production date.")],
  "good_quantity * net_price", "Value good production at its net price. This is not invoice revenue or accounting profit.", "INR", ["Use production-date rates and product-specific unit matching.", "Fallback quantity selection is a separate explicit rule."], v => v.good_quantity.mul(v.net_price));

define("material-cost", "Material Cost", "estimated_operational", "Decisions 50, 63, 78; provisional cost-basis interpretation", [qty("reported", "mms"), rate("material_per_unit")],
  "reported * material_per_unit", "Apply material cost to all produced units, including rejection and rework. Incremental rework material is separate.", "INR", ["Do not use only good quantity and omit material already consumed by rejected units.", "Do not add this again inside consolidated manufacturing costs."], v => v.reported.mul(v.material_per_unit));

define("machine-cost-consolidated", "Consolidated Machine Cost", "estimated_operational", "Decisions 64, 71, 73", [seconds("running_seconds"), input("hourly_rate", "INR/hour", "financial_master", "Consolidated rate: includes its configured components.")],
  "running_seconds / 3600 * hourly_rate", "Apply a single consolidated rate to eligible running time.", "INR", ["Electricity, maintenance and tooling cannot be supplied again to this formula."], v => hours(v.running_seconds).mul(v.hourly_rate));

define("machine-cost-itemized", "Itemized Machine Cost", "estimated_operational", "Decision 64; Phase 3 itemized machine contract", [seconds("running_seconds"), ...["base", "electricity", "maintenance", "tooling"].map(key => input(key, "INR/hour", "financial_master", "Non-overlapping hourly component; explicit zero if not applicable."))],
  "running_seconds / 3600 * (base + electricity + maintenance + tooling)", "Add explicitly disjoint hourly components; consolidated rates are not accepted.", "INR", ["Do not include actual maintenance expenditure for the same purpose as this maintenance provision."], v => hours(v.running_seconds).mul(sum(v.base, v.electricity, v.maintenance, v.tooling)));

define("labour-operator-shift", "Operator Shift Labour Cost", "estimated_operational", "Decisions 65–69, 71", [seconds("paid_seconds"), input("standard_shift_seconds", "second", "financial_master", "Paid seconds in one standard shift.", { positive: true, maximum: "86400" }), input("shift_rate", "INR/operator_shift", "financial_master", "Pay for one operator's standard shift.")],
  "paid_seconds / standard_shift_seconds * shift_rate", "Prorate one operator assignment by paid time. Paid breaks count; overtime is handled separately.", "INR", ["One resolved operator assignment per calculation; do not duplicate shared operators.", "Base paid seconds must exclude overtime billed separately."], v => v.paid_seconds.div(v.standard_shift_seconds).mul(v.shift_rate));

for (const [id, name, unit] of [["labour-operator-hour", "Operator Hour Labour Cost", "INR/operator_hour"], ["labour-machine-hour", "Machine Hour Labour Cost", "INR/machine_hour"]]) {
  define(id, name, "estimated_operational", "Decisions 65–69", [seconds("paid_seconds"), input("hourly_rate", unit, "financial_master", "Rate for the selected labour basis.")], "paid_seconds / 3600 * hourly_rate", "Apply paid duration for one resolved labour assignment.", "INR", ["Do not combine alternate labour methods for the same assignment."], v => hours(v.paid_seconds).mul(v.hourly_rate));
}

define("overtime-cost", "Overtime Labour Cost", "estimated_operational", "Decision 67", [seconds("overtime_seconds"), input("base_hourly_rate", "INR/operator_hour", "financial_master", "Base hourly labour rate."), input("multiplier", "ratio", "financial_master", "Full overtime multiplier, not an additional premium.", { positive: true })],
  "overtime_seconds / 3600 * base_hourly_rate * multiplier", "Calculate full overtime pay. Do not also include these hours in base pay.", "INR", ["Multiplier must be explicit and positive."], v => hours(v.overtime_seconds).mul(v.base_hourly_rate).mul(v.multiplier));

define("period-allocation", "Fixed Period Cost Allocation", "estimated_operational", "Decisions 65, 69–71; Phase 3 overhead allocation", [input("period_cost", "INR", "financial_master", "Fixed labour or overhead amount for a known period."), input("share", "ratio", "derived", "Explicit calendar/allocation share of that same period.", { maximum: "1" })],
  "period_cost * share", "Allocate an explicit share of a fixed-period cost. The formula does not infer calendars or allocation denominators.", "INR", ["Shares must not overlap across allocations.", "Shutdowns do not automatically remove fixed costs."], v => v.period_cost.mul(v.share));

define("gross-rejection-cost", "Gross Rejection Cost Attribution", "estimated_operational", "Decisions 77–81", [qty("rejected", "mms"), rate("accrued_cost_per_unit")],
  "rejected * accrued_cost_per_unit", "Attribute manufacturing cost already accrued on rejected units. This is not an additional expense to deduct twice.", "INR", ["Unknown rejection stage uses provisional full accrued variable cost.", "Do not add attribution again to material/machine/labour totals."], v => v.rejected.mul(v.accrued_cost_per_unit));

define("scrap-recovery", "Scrap Recovery Value", "estimated_operational", "Decisions 78, 80–81", [qty("scrap_quantity"), input("recovery_per_unit", "INR/{unit}", "financial_master", "Confirmed product-specific recovery per unit.", { confirmedOnly: true })],
  "scrap_quantity * recovery_per_unit", "Value a documented recoverable scrap quantity using a confirmed rate.", "INR", ["Unknown recovery is unavailable, never zero."], v => v.scrap_quantity.mul(v.recovery_per_unit));

define("net-rejection-loss", "Net Rejection Loss Attribution", "estimated_operational", "Decisions 78, 81", [money("gross_rejection", "Gross rejection cost attribution for the same units."), { ...money("scrap_recovery", "Confirmed scrap recovery for those rejected units only."), confirmedOnly: true }],
  "gross_rejection - scrap_recovery", "Subtract confirmed recovery from gross rejection attribution, without deducting it again from operating profit.", "INR", ["Missing recovery blocks net loss but leaves independent gross cost available."], v => v.gross_rejection.sub(v.scrap_recovery), v => v.scrap_recovery.compare(v.gross_rejection) > 0 ? ["Recovery exceeds accrued cost; negative net attribution retained for review."] : []);

define("incremental-rework-cost", "Incremental Rework Cost", "estimated_operational", "Decisions 77, 79; Phase 3 rework rate", [qty("rework", "mms"), rate("incremental_cost_per_unit")],
  "rework * incremental_cost_per_unit", "Apply an incremental rework rate; ordinary manufacturing costs must not be included again.", "INR", ["Do not combine a consolidated rework rate with its itemized components."], v => v.rework.mul(v.incremental_cost_per_unit));

define("contribution-margin", "Contribution Margin per Unit", "estimated_operational", "Decision 83", [input("net_price", "INR/{unit}", "derived", "Net selling price."), input("avoidable_cost", "INR/{unit}", "derived", "Avoidable variable cost per unit, excluding fixed and opportunity costs.")],
  "net_price - avoidable_cost", "Keep negative contribution visible; it does not represent recoverable profit.", "INR/{unit}", ["Fixed overhead must not be included as avoidable variable cost."], v => v.net_price.sub(v.avoidable_cost));

define("machine-hour-opportunity", "Machine-Hour Opportunity Impact", "opportunity", "Decisions 77, 82", [seconds("lost_seconds"), input("hourly_rate", "INR/hour", "financial_master", "Machine-hour capacity valuation rate.")],
  "lost_seconds / 3600 * hourly_rate", "Value unused machine capacity separately from incurred operating expense.", "INR", ["System Off must first be classified.", "Overlapping events must be resolved before this formula.", "Never automatically deduct this impact from operating profit."], v => hours(v.lost_seconds).mul(v.hourly_rate));

define("shortfall-opportunity", "Demand-Constrained Shortfall Opportunity", "opportunity", "Decisions 83–85; non-positive-contribution guard is provisional", [qty("lost_good_units"), { ...qty("unfulfilled_demand", "demand"), confirmedOnly: true }, input("contribution_per_unit", "INR/{unit}", "derived", "Signed contribution margin per unit.", { minimum: null })],
  "min(lost_good_units, unfulfilled_demand) * max(0, contribution_per_unit)", "Cap lost units by confirmed unfulfilled demand. Non-positive contribution provides no positive profit opportunity.", "INR", ["Demand must be residual unfulfilled demand, not total orders already served.", "Without confirmed demand this demand-constrained result is unavailable."], v => v.lost_good_units.min(v.unfulfilled_demand).mul(v.contribution_per_unit.max(zero)));

define("recoverable-opportunity", "Recoverable Profit Opportunity", "opportunity", "Decisions 89–90", [money("gross_opportunity", "Non-overlapping opportunity for one resolved cause/action."), percent("recovery_percent", true)],
  "gross_opportunity * recovery_percent / 100", "Apply an approved cause-specific recovery percentage, never an assumed global percentage.", "INR", ["Input evidence must identify the cause/action-specific recovery rule."], v => v.gross_opportunity.mul(v.recovery_percent).div(hundred));

define("operating-profit", "Estimated Operating Profit", "estimated_operational", "Decisions 4, 52–54, 63, 76–77", [money("production_value", "Estimated Production Value; not actual invoice revenue."), money("operating_cost", "Complete, deduplicated operating cost ledger, including mandatory material cost.")],
  "production_value - operating_cost", "Subtract complete operating cost from estimated production value; retain genuine negative profit.", "INR", ["Partial operating cost must not be passed as a complete total.", "Exclude accounting COGS, opportunity loss, depreciation and financing."], v => v.production_value.sub(v.operating_cost));

define("profit-margin", "Estimated Operating Profit Margin", "estimated_operational", "Decision 112; conventional ratio, provisional pending review", [money("operating_profit", "Signed estimated operating profit.", true), money("production_value", "Estimated production value for the same scope.")],
  "operating_profit / production_value * 100", "Express estimated operating profit as a percentage of estimated production value.", "percent", ["Zero production value makes margin unavailable, not zero."], v => v.operating_profit.div(v.production_value).mul(hundred));

define("potential-profit", "Potential Profit Scenario", "scenario", "Decision 93", [money("operating_profit", "Current estimated operating profit.", true), { ...money("recoverable_opportunity", "Approved non-overlapping recoverable opportunity."), confirmedOnly: true }],
  "operating_profit + recoverable_opportunity", "This is a scenario, not current profit or guaranteed future earnings.", "INR", ["Only approved recoverable opportunity is eligible; gross opportunity is not interchangeable."], v => v.operating_profit.add(v.recoverable_opportunity));

// Never expose mutable implementation state or executable functions via the catalog.
export function listFormulaDefinitions(): FormulaDefinition[] {
  return structuredClone(implementationList.map(item => item.definition));
}
export function findFormulaDefinition(policyId: string, formulaVersion: string): FormulaDefinition | undefined {
  const found = implementationList.find(item => item.definition.policyId === policyId && item.definition.formulaVersion === formulaVersion);
  return found ? structuredClone(found.definition) : undefined;
}
export function runBoundFormula(policyId: string, formulaVersion: string, values: Values): { value: Exact; warnings: string[] } {
  const found = implementationList.find(item => item.definition.policyId === policyId && item.definition.formulaVersion === formulaVersion);
  if (!found) throw new Error("No exact formula implementation exists.");
  return { value: found.run(values), warnings: found.warnings?.(values) ?? [] };
}
