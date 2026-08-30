import { parsePolicy, type DeepReadonly, type FinancialPolicy, type PolicyReference } from "./schema";

export type PolicyRecord = DeepReadonly<FinancialPolicy>;
export type PolicyRegistry = Readonly<{
  size: number;
  get: (reference: PolicyReference) => PolicyRecord | undefined;
  list: (policyId?: string) => readonly PolicyRecord[];
}>;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const key = (reference: PolicyReference) => JSON.stringify([reference.policyId, reference.formulaVersion]);

/**
 * Explicit-version lookup only. Never guesses a latest/applicable version.
 * This read-only in-memory catalog is not a persistence or approval workflow.
 */
export function createPolicyRegistry(values: readonly unknown[]): PolicyRegistry {
  if (values.length > 10_000) throw new Error("Policy registry exceeds 10,000 records.");
  const records = new Map<string, PolicyRecord>();
  for (const value of values) {
    const policy = freeze(parsePolicy(value));
    const referenceKey = key(policy);
    if (records.has(referenceKey)) throw new Error(`Duplicate policy version: ${policy.policyId}@${policy.formulaVersion}.`);
    records.set(referenceKey, policy);
  }
  const all = Object.freeze([...records.values()]);
  return Object.freeze({
    size: records.size,
    get: (reference: PolicyReference) => records.get(key(reference)),
    list: (policyId?: string) => policyId === undefined ? all : Object.freeze(all.filter(policy => policy.policyId === policyId)),
  });
}
