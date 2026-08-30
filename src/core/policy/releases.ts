import { z } from "zod";
import { parseMaster, type FinancialMaster } from "../financial/schema";
import { validateMaster } from "../financial/validation";
import { assertFormulaBinding, evaluatePolicy, type FormulaRequest, type FormulaResult } from "./evaluate";
import { parsePolicy, type DeepReadonly, type FinancialPolicy } from "./schema";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",") + "}";
  return JSON.stringify(value);
}
export async function fingerprint(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export function immutable<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value as DeepReadonly<T>;
}
const name = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(1).max(2000);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z.object({ actor: name, at: z.iso.datetime(), reason }).strict();
export type ReleaseMetadata = z.infer<typeof metadata>;
const releaseSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().min(1).max(1000),
  parentId: z.string().uuid().nullable(), parentHash: digest.nullable(),
  metadata, master: z.unknown(), policies: z.array(z.unknown()).min(1).max(500), hash: digest,
}).strict();
type ReleaseData = Omit<z.infer<typeof releaseSchema>, "master" | "policies"> & { master: FinancialMaster; policies: FinancialPolicy[] };
export type FinancialRelease = DeepReadonly<ReleaseData>;
export const policyKey = (policy: Pick<FinancialPolicy, "policyId" | "formulaVersion" | "effectiveDates">) => `${policy.policyId}@${policy.formulaVersion}:${policy.effectiveDates.from}`;

function validateSchedule(policies: FinancialPolicy[]): void {
  const groups = new Map<string, FinancialPolicy[]>();
  for (const policy of policies) { assertFormulaBinding(policy); groups.set(policy.policyId, [...groups.get(policy.policyId) ?? [], policy]); }
  for (const group of groups.values()) {
    group.sort((a, b) => a.effectiveDates.from.localeCompare(b.effectiveDates.from));
    for (let i = 1; i < group.length; i++) {
      if ((group[i - 1].effectiveDates.through ?? "9999-12-31") >= group[i].effectiveDates.from) throw new Error("Overlapping effective dates are blocking; close the earlier interval in the new release.");
    }
  }
}

export async function verifyRelease(value: unknown): Promise<FinancialRelease> {
  const parsed = releaseSchema.parse(value);
  const master = parseMaster(parsed.master);
  const policies = parsed.policies.map(parsePolicy);
  if (!master.factory.trim()) throw new Error("A named factory is required for a release.");
  const blocking = validateMaster(master).filter(issue => issue.level === "error");
  if (blocking.length) throw new Error(`Financial master has ${blocking.length} blocking validation errors.`);
  validateSchedule(policies);
  if (policies.some(policy => policy.changeHistory.some(event => Date.parse(event.at) > Date.parse(parsed.metadata.at)))) throw new Error("Release time cannot precede policy history.");
  const data = { ...parsed, master, policies };
  const { hash, ...payload } = data;
  if (await fingerprint(payload) !== hash) throw new Error("Release integrity check failed.");
  return immutable(data);
}

export async function verifyReleaseHistory(values: readonly unknown[]): Promise<readonly FinancialRelease[]> {
  if (values.length > 100) throw new Error("At most 100 releases per local archive.");
  const releases: FinancialRelease[] = [];
  for (const value of values) {
    const release = await verifyRelease(value);
    const previous = releases.at(-1);
    if (release.revision !== releases.length + 1 || release.parentId !== (previous?.id ?? null) || release.parentHash !== (previous?.hash ?? null)) throw new Error("Broken release lineage or missing parent.");
    if (releases.some(item => item.id === release.id)) throw new Error("Duplicate release ID.");
    if (previous && (previous.master.id !== release.master.id || previous.master.factory !== release.master.factory || Date.parse(release.metadata.at) < Date.parse(previous.metadata.at))) throw new Error("Release factory identity or chronology changed.");
    releases.push(release);
  }
  return immutable(releases);
}

export async function publishRelease(history: readonly FinancialRelease[], masterValue: unknown, policyValues: readonly unknown[], event: ReleaseMetadata): Promise<readonly FinancialRelease[]> {
  const existing = await verifyReleaseHistory(history);
  const master = parseMaster(masterValue);
  const policies = policyValues.map(parsePolicy);
  const meta = metadata.parse(event);
  const previous = existing.at(-1);
  if (previous) {
    for (const policy of policies) {
      const unchanged = previous.policies.some(old => canonicalJson(old) === canonicalJson(policy));
      if (!unchanged && policy.approval.state === "recorded" && Date.parse(policy.approval.approvedAt) <= Date.parse(previous.metadata.at)) throw new Error("Changed confirmed policies require fresh approval; inherited approval cannot authorize edits.");
    }
    for (const section of Object.keys(master.sections) as (keyof FinancialMaster["sections"])[]) {
      for (const row of master.sections[section]) {
        const old = previous.master.sections[section].find(item => item.id === row.id);
        const economic = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([key]) => !["status", "approvedBy", "note"].includes(key)));
        if (old?.values.status === "confirmed" && row.values.status === "confirmed" && canonicalJson(economic(old.values)) !== canonicalJson(economic(row.values))) throw new Error("Changed confirmed master entries must return to draft before publishing.");
      }
    }
  }
  const payload = { schemaVersion: 1 as const, id: crypto.randomUUID(), revision: existing.length + 1, parentId: previous?.id ?? null, parentHash: previous?.hash ?? null, metadata: meta, master, policies };
  return verifyReleaseHistory([...existing, { ...payload, hash: await fingerprint(payload) }]);
}

export function approvePolicy(value: unknown, approval: { approvedBy: string; approvedAt: string; reason: string; evidenceReference: string }): FinancialPolicy {
  const policy = parsePolicy(value);
  if (policy.status !== "provisional") throw new Error("Only a provisional policy can receive new approval.");
  return parsePolicy({ ...policy, status: "confirmed", approval: { state: "recorded", ...approval, identityVerification: "self_declared" }, changeHistory: [...policy.changeHistory, { id: `approved-${policy.changeHistory.length}`, action: "approval_recorded", actor: approval.approvedBy, at: approval.approvedAt, reason: approval.reason, changes: [{ field: "status", before: "provisional", after: "confirmed" }] }] });
}

export function revisePolicyGovernance(value: unknown, dates: FinancialPolicy["effectiveDates"], confidence: FinancialPolicy["confidence"], event: ReleaseMetadata): FinancialPolicy {
  const old = parsePolicy(value);
  const meta = metadata.parse(event);
  if (Date.parse(meta.at) < Date.parse(old.changeHistory.at(-1)!.at)) throw new Error("Revision cannot precede policy history.");
  return parsePolicy({ ...old, effectiveDates: dates, confidence, status: "provisional", approval: { state: "pending", reason: meta.reason },
    changeHistory: [{ id: "created", action: "created", actor: meta.actor, at: meta.at, reason: meta.reason, changes: [] },
      { id: "revised", action: "revised", actor: meta.actor, at: meta.at, reason: meta.reason, changes: [{ field: "governance-revision", before: canonicalJson({ dates: old.effectiveDates, confidence: old.confidence, status: old.status }), after: canonicalJson({ dates, confidence, status: "provisional" }) }] }],
  });
}

export type PolicyResolution = { status: "selected"; policy: DeepReadonly<FinancialPolicy>; key: string } | { status: "gap" | "provisional_blocked"; message: string };
export function resolvePolicy(release: FinancialRelease, policyId: string, date: string, allowProvisional = false): PolicyResolution {
  z.iso.date().parse(date);
  const matches = release.policies.filter(policy => policy.policyId === policyId && policy.effectiveDates.from <= date && (policy.effectiveDates.through === null || policy.effectiveDates.through >= date));
  if (matches.length > 1) throw new Error("Ambiguous policy schedule.");
  if (!matches.length) return { status: "gap", message: "No policy covers this business date; no latest-version fallback was applied." };
  if (matches[0].status === "provisional" && !allowProvisional) return { status: "provisional_blocked", message: "Explicit provisional-policy opt-in is required." };
  return { status: "selected", policy: matches[0], key: policyKey(matches[0]) };
}

export function policyCoverage(release: FinancialRelease, policyId: string, from: string, through: string): { from: string; through: string }[] {
  z.iso.date().parse(from); z.iso.date().parse(through);
  if (from > through) throw new Error("Invalid coverage interval.");
  let cursor = from;
  const gaps: { from: string; through: string }[] = [];
  const day = (value: string, delta: number) => new Date(Date.parse(`${value}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
  for (const policy of [...release.policies].filter(p => p.policyId === policyId).sort((a, b) => a.effectiveDates.from.localeCompare(b.effectiveDates.from))) {
    const start = policy.effectiveDates.from, end = policy.effectiveDates.through ?? "9999-12-31";
    if (end < cursor) continue;
    if (start > through) break;
    if (start > cursor) gaps.push({ from: cursor, through: day(start, -1) });
    if (end >= through) return gaps;
    cursor = day(end, 1);
  }
  if (cursor <= through) gaps.push({ from: cursor, through });
  return gaps;
}

export type PinnedRun = DeepReadonly<{ schemaVersion: 1; id: string; releaseId: string; releaseHash: string; sourceFingerprint: string; policyKey: string; request: FormulaRequest; result: FormulaResult; hash: string }>;
export async function pinCalculation(releaseValue: FinancialRelease, policyId: string, request: FormulaRequest, sourceFingerprint: string): Promise<PinnedRun> {
  const release = await verifyRelease(releaseValue);
  digest.parse(sourceFingerprint);
  const selected = resolvePolicy(release, policyId, request.businessDate, request.allowProvisional);
  if (selected.status !== "selected") throw new Error(selected.message);
  const result = evaluatePolicy(selected.policy, request);
  if (result.issues.some(issue => issue.code === "invalid_request")) throw new Error("Cannot pin malformed input evidence.");
  const payload = { schemaVersion: 1 as const, id: crypto.randomUUID(), releaseId: release.id, releaseHash: release.hash, sourceFingerprint, policyKey: selected.key, request: structuredClone(request), result };
  return immutable({ ...payload, hash: await fingerprint(payload) });
}

export async function verifyPinnedRun(value: unknown, history: readonly FinancialRelease[]): Promise<PinnedRun> {
  const boundary = z.object({ schemaVersion: z.literal(1), id: z.string().uuid(), releaseId: z.string().uuid(), releaseHash: digest, sourceFingerprint: digest, policyKey: name, request: z.unknown(), result: z.unknown(), hash: digest }).strict();
  const parsed = boundary.parse(value);
  const { hash, ...payload } = parsed;
  if (await fingerprint(payload) !== hash) throw new Error("Pinned-run integrity check failed.");
  const release = history.find(item => item.id === parsed.releaseId && item.hash === parsed.releaseHash);
  if (!release) throw new Error("Pinned release is missing or changed.");
  await verifyRelease(release);
  const policy = release.policies.find(policy => policyKey(policy) === parsed.policyKey);
  if (!policy) throw new Error("Pinned policy is missing.");
  const reproduced = evaluatePolicy(policy, parsed.request);
  if (reproduced.issues.some(issue => issue.code === "invalid_request") || canonicalJson(reproduced) !== canonicalJson(parsed.result)) throw new Error("Pinned calculation no longer reproduces under its exact policy.");
  return immutable(parsed as PinnedRun);
}
