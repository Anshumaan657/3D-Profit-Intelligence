import { evaluatePolicy } from "./evaluate";
import { parsePolicy } from "./schema";
import { qualityEvidenceSchema } from "./quality-evidence";

export type ConfidenceResult = {
  score: number | null;
  label: "High" | "Medium" | "Low" | "Very low" | "Unavailable";
  meaning: "evidence_not_probability";
  reasons: string[];
  components: Record<string, number>;
};
/** Evidence scores are computed per result. There is deliberately no user score override. */
export function evaluateWithConfidence(policyValue: unknown, requestValue: unknown, qualityValue: unknown) {
  const calculation = evaluatePolicy(policyValue, requestValue, qualityValue);
  const confidence: ConfidenceResult = { score: null, label: "Unavailable", meaning: "evidence_not_probability", reasons: [], components: {} };
  if (calculation.status !== "available") { confidence.reasons = calculation.issues.map(issue => issue.message); return { calculation, confidence }; }
  const policy = parsePolicy(policyValue);
  const quality = qualityEvidenceSchema.safeParse(qualityValue);
  if (!quality.success || !policy.confidence.bands) { confidence.reasons.push("Evidence-backed quality assessments and versioned label thresholds are required; no score was assumed."); return { calculation, confidence }; }
  confidence.components.required_inputs = 100; // available calculation has validated every mandatory input
  for (const [key, assessment] of Object.entries(quality.data)) {
    confidence.components[key] = assessment.score;
    if (assessment.score < 100) confidence.reasons.push(`${key}: ${assessment.score}/100 — ${assessment.method}`);
  }
  let policyCap = 100;
  for (const input of policy.inputs) {
    const evidence = calculation.inputs[input.key];
    if (evidence && evidence.status !== "confirmed") {
      const condition = evidence.status === "estimated" ? "estimated_input" : "provisional_input";
      if (!policy.confidence.rules.some(rule => rule.condition === condition && rule.inputKey === input.key)) {
        confidence.reasons.push(`No versioned confidence rule covers ${input.key}'s ${evidence.status} evidence.`);
        return { calculation, confidence };
      }
    }
  }
  for (const rule of policy.confidence.rules) {
    const input = rule.inputKey ? calculation.inputs[rule.inputKey] : null;
    const qualityKey = rule.condition as keyof typeof quality.data;
    const triggered = rule.condition === "provisional_policy" && policy.status === "provisional" ||
      rule.condition === "missing_input" && !input || rule.condition === "estimated_input" && input?.status === "estimated" ||
      rule.condition === "provisional_input" && input?.status === "provisional" || qualityKey in quality.data && quality.data[qualityKey].score < 100;
    if (!triggered) continue;
    confidence.reasons.push(rule.reason);
    if (rule.effect.kind === "unavailable") return { calculation, confidence };
    policyCap = Math.min(policyCap, rule.effect.maximumScore);
  }
  confidence.components.policy_and_input_caps = policyCap;
  confidence.score = Math.min(...Object.values(confidence.components));
  const bands = policy.confidence.bands;
  confidence.label = confidence.score >= bands.high ? "High" : confidence.score >= bands.medium ? "Medium" : confidence.score >= bands.low ? "Low" : "Very low";
  return { calculation, confidence };
}
