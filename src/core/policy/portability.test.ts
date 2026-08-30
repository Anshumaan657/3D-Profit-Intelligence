import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMaster } from "../financial/schema";
import { createProvisionalFormulaPolicy, type FormulaRequest } from "./evaluate";
import { approvePolicy, fingerprint, pinCalculation, publishRelease } from "./releases";
import { emptyArchive, exportArchive, importArchive, mergeArchives, verifyArchive } from "./portability";
import { deleteLocalArchive, loadLocalArchive, POLICY_STORAGE_KEY, saveLocalArchive } from "./local-archive";
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
const now = Date.parse("2026-01-02T00:00:00Z");
const consent = { granted: true as const, consentAt: "2026-01-02T00:00:00Z", retentionDays: 30 };
async function fixture() {
  const master = emptyMaster(); master.factory = "Synthetic plant"; master.scope = { from: "2026-01-01", to: "2026-12-31" };
  const policy = createProvisionalFormulaPolicy("material-cost", "1.0.0", { createdAt: "2026-01-01T00:00:00Z", createdBy: "Synthetic", reason: "Test only", effectiveDates: { from: "2026-01-01", through: null }, confidence: { scoreMeaning: "evidence_not_probability", aggregation: "weakest_component_cap", bands: { high: 85, medium: 65, low: 40 }, rules: [{ id: "provisional", condition: "provisional_policy", inputKey: null, effect: { kind: "cap", maximumScore: 60 }, reason: "Synthetic cap" }] } });
  const event = { at: "2026-01-01T00:00:00Z", actor: "Synthetic", reason: "Test only" };
  const releases = await publishRelease([], master, [policy], event);
  const request: FormulaRequest = { businessDate: "2026-01-02", scopeId: "test", quantityUnit: "piece", allowProvisional: true, inputs: { reported: { amount: "10", scopeId: "test", unit: "piece", category: "production", source: "mms", status: "confirmed", complete: true, evidenceRefs: ["test:1"] }, material_per_unit: { amount: "5", scopeId: "test", unit: "INR/piece", category: "configuration", source: "financial_master", status: "confirmed", complete: true, evidenceRefs: ["test:2"] } } };
  const assessment = { score: 100, evidenceRefs: ["test:quality"], method: "Synthetic quality assessment" };
  const quality = { source_quality: assessment, mapping_quality: assessment, formula_reliability: assessment };
  const run = await pinCalculation(releases[0], "material-cost", request, await fingerprint("test source"), quality);
  return { archive: { ...emptyArchive(), releases, runs: [run] }, master, policy, event };
}
function memoryStore() { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { map.set(key, value); }), removeItem: vi.fn((key: string) => { map.delete(key); }) }; }
describe("version preserving policy archives", () => {
  it("round-trips releases, master snapshots and scored pinned calculations", async () => {
    const { archive } = await fixture(); const restored = await importArchive(await exportArchive(archive));
    expect(restored).toEqual(archive); expect(restored.runs[0].confidence?.score).toBe(60); expect(restored.runs[0].result.exactValue).toEqual({ numerator: "50", denominator: "1" });
  });
  it("preserves a provisional historical score after approval, export and restore", async () => {
    const f = await fixture();
    const confirmed = approvePolicy(f.policy, { approvedBy: "Synthetic reviewer", approvedAt: "2026-01-02T00:00:00Z", reason: "Synthetic approval", evidenceReference: "test:written" });
    const releases = await publishRelease(f.archive.releases, f.master, [confirmed], { ...f.event, at: "2026-01-02T00:00:00Z" });
    const restored = await importArchive(await exportArchive({ ...f.archive, releases }));
    expect(restored.releases[1].policies[0].status).toBe("confirmed");
    expect(restored.runs[0].result.policy?.status).toBe("provisional");
    expect(restored.runs[0].confidence?.score).toBe(60);
    expect((await mergeArchives(emptyArchive(), restored)).releases).toHaveLength(2);
  });
  it("merges only compatible extensions and never drops newer history", async () => {
    const f = await fixture(); const newer = { ...f.archive, releases: await publishRelease(f.archive.releases, f.master, [f.policy], f.event) };
    expect((await mergeArchives(f.archive, newer)).releases).toHaveLength(2);
    expect((await mergeArchives(newer, f.archive)).releases).toHaveLength(2);
    expect((await mergeArchives(f.archive, f.archive)).runs).toHaveLength(1);
  });
  it("rejects different factories and divergent histories", async () => {
    const f = await fixture(), other = await fixture();
    await expect(mergeArchives(f.archive, other.archive)).rejects.toThrow(/Conflicting/);
    const branchA = { ...f.archive, releases: await publishRelease(f.archive.releases, f.master, [f.policy], f.event) };
    const branchB = { ...f.archive, releases: await publishRelease(f.archive.releases, f.master, [f.policy], f.event) };
    await expect(mergeArchives(branchA, branchB)).rejects.toThrow(/Conflicting/);
  });
  it("rejects malformed, oversized, unknown-schema and tampered input", async () => {
    await expect(importArchive("oops")).rejects.toThrow();
    await expect(importArchive(" ".repeat(10 * 1024 * 1024 + 1))).rejects.toThrow(/10 MB/);
    await expect(verifyArchive({ ...emptyArchive(), schemaVersion: 99 })).rejects.toThrow();
    const { archive } = await fixture(); const changed = JSON.parse(JSON.stringify(archive)); changed.releases[0].master.factory = "Tampered";
    await expect(verifyArchive(changed)).rejects.toThrow(/integrity/);
  });
  it("rejects a rehashed changed result and missing pinned release", async () => {
    const { archive } = await fixture(); const changed = JSON.parse(JSON.stringify(archive)); changed.runs[0].result.exactValue.numerator = "999";
    const { hash: _hash, ...payload } = changed.runs[0]; void _hash; changed.runs[0].hash = await fingerprint(payload);
    await expect(verifyArchive(changed)).rejects.toThrow(/reproduces/);
    await expect(verifyArchive({ ...archive, releases: [] })).rejects.toThrow(/missing/);
  });
  it("replays confidence rather than trusting an imported score", async () => {
    const { archive } = await fixture(); const changed = JSON.parse(JSON.stringify(archive)); changed.runs[0].confidence.score = 100;
    const { hash: _hash, ...payload } = changed.runs[0]; void _hash; changed.runs[0].hash = await fingerprint(payload);
    await expect(verifyArchive(changed)).rejects.toThrow(/confidence/);
  });
  it("enforces fresh approval rules during restore, even when payload hashes are recomputed", async () => {
    const f = await fixture(); const approved = approvePolicy(f.policy, { approvedBy: "Test reviewer", approvedAt: f.event.at, evidenceReference: "test:approval", reason: "Synthetic" });
    const first = await publishRelease([], f.master, [approved], f.event);
    const second = JSON.parse(JSON.stringify(first[0])); second.id = crypto.randomUUID(); second.revision = 2; second.parentId = first[0].id; second.parentHash = first[0].hash; second.policies[0].effectiveDates.through = "2026-06-30";
    const { hash: _hash, ...payload } = second; void _hash; second.hash = await fingerprint(payload);
    await expect(verifyArchive({ ...emptyArchive(), releases: [first[0], second] })).rejects.toThrow(/fresh approval/);
  });
});
describe("consent and local policy retention", () => {
  it("requires explicit consent and saves without touching unrelated data", async () => {
    const { archive } = await fixture(), store = memoryStore(); store.map.set("unrelated", "keep");
    await expect(saveLocalArchive(store, archive, { ...consent, granted: false } as never, undefined, () => now)).rejects.toThrow();
    expect(store.setItem).not.toHaveBeenCalled();
    await saveLocalArchive(store, archive, consent, undefined, () => now);
    expect((await loadLocalArchive(store, now))?.archive).toEqual(archive);
    deleteLocalArchive(store); expect(store.getItem(POLICY_STORAGE_KEY)).toBeNull(); expect(store.getItem("unrelated")).toBe("keep");
  });
  it("expires at the consent boundary and never slides retention on save", async () => {
    const { archive } = await fixture(), store = memoryStore(); await saveLocalArchive(store, archive, consent, undefined, () => now);
    const first = JSON.parse(store.getItem(POLICY_STORAGE_KEY)!);
    await saveLocalArchive(store, archive, consent, undefined, () => now + 86400000);
    expect(JSON.parse(store.getItem(POLICY_STORAGE_KEY)!).expiresAt).toBe(first.expiresAt);
    expect(await loadLocalArchive(store, now + 30 * 86400000)).toBeNull(); expect(store.getItem(POLICY_STORAGE_KEY)).toBeNull();
  });
  it("does not write after withdrawal cancels an in-flight validation", async () => {
    const { archive } = await fixture(), store = memoryStore(); const controller = new AbortController();
    const pending = saveLocalArchive(store, archive, consent, controller.signal, () => now); controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/); expect(store.setItem).not.toHaveBeenCalled();
  });
  it("preserves the previous backup on quota failure", async () => {
    const { archive } = await fixture(), store = memoryStore(); await saveLocalArchive(store, archive, consent, undefined, () => now); const raw = store.getItem(POLICY_STORAGE_KEY);
    store.setItem.mockImplementation(() => { throw new Error("quota"); }); await expect(saveLocalArchive(store, archive, consent, undefined, () => now)).rejects.toThrow("quota"); expect(store.getItem(POLICY_STORAGE_KEY)).toBe(raw);
  });
  it("rejects stale or different-factory saves instead of replacing local history", async () => {
    const f = await fixture(), store = memoryStore(); const newer = { ...f.archive, releases: await publishRelease(f.archive.releases, f.master, [f.policy], f.event) };
    await saveLocalArchive(store, newer, consent, undefined, () => now);
    await expect(saveLocalArchive(store, f.archive, consent, undefined, () => now)).rejects.toThrow(/newer/);
    await expect(saveLocalArchive(store, (await fixture()).archive, consent, undefined, () => now)).rejects.toThrow(/Conflicting/);
  });
  it.each([0, 91, 1.5])("rejects invalid retention %s", async retentionDays => { await expect(saveLocalArchive(memoryStore(), emptyArchive(), { ...consent, retentionDays }, undefined, () => now)).rejects.toThrow(); });
});
