import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMaster } from "../financial/schema";
import { createProvisionalFormulaPolicy, type FormulaRequest } from "./evaluate";
import { approvePolicy, fingerprint, pinCalculation, policyCoverage, publishRelease, resolvePolicy, revisePolicyGovernance, verifyPinnedRun, verifyRelease, verifyReleaseHistory } from "./releases";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
export function releaseFixture() {
  const master = emptyMaster(); master.factory = "Synthetic plant"; master.scope = { from: "2026-01-01", to: "2026-12-31" };
  const event = { actor: "Synthetic author", at: "2026-01-01T00:00:00Z", reason: "Synthetic policy release" };
  const policy = createProvisionalFormulaPolicy("material-cost", "1.0.0", { effectiveDates: { from: "2026-01-01", through: "2026-06-30" }, createdAt: event.at, createdBy: event.actor, reason: event.reason,
    confidence: { scoreMeaning: "evidence_not_probability", aggregation: "weakest_component_cap", rules: [{ id: "provisional", condition: "provisional_policy", inputKey: null, effect: { kind: "cap", maximumScore: 60 }, reason: "Synthetic test threshold" }] } });
  const request: FormulaRequest = { businessDate: "2026-06-01", scopeId: "synthetic", quantityUnit: "piece", allowProvisional: true, inputs: {
    reported: { amount: "10", scopeId: "synthetic", unit: "piece", source: "mms", category: "production", status: "confirmed", complete: true, evidenceRefs: ["test:row1"] },
    material_per_unit: { amount: "5", scopeId: "synthetic", unit: "INR/piece", source: "financial_master", category: "configuration", status: "confirmed", complete: true, evidenceRefs: ["test:rate1"] },
  } };
  return { master, event, policy, request };
}
describe("immutable policy and master releases", () => {
  it("captures detached immutable master and policy snapshots", async () => {
    const f = releaseFixture(); const history = await publishRelease([], f.master, [f.policy], f.event);
    f.master.factory = "Mutated"; f.policy.description = "Mutated";
    expect(history[0].master.factory).toBe("Synthetic plant");
    expect(Object.isFrozen(history[0].master.sections.products)).toBe(true);
    expect(await verifyRelease(history[0])).toEqual(history[0]);
  });
  it("records a new approval without modifying its original release", async () => {
    const f = releaseFixture(); const old = await publishRelease([], f.master, [f.policy], f.event);
    const policy = approvePolicy(f.policy, { approvedBy: "Synthetic reviewer", approvedAt: "2026-01-02T00:00:00Z", reason: "Test only", evidenceReference: "test:approval" });
    const history = await publishRelease(old, f.master, [policy], { ...f.event, at: "2026-01-02T00:00:00Z" });
    expect(history[0].policies[0].status).toBe("provisional"); expect(history[1].policies[0].status).toBe("confirmed");
    expect(history[1].parentHash).toBe(history[0].hash); expect(history[1].revision).toBe(2);
    expect(resolvePolicy(history[1], "material-cost", "2026-06-30").status).toBe("selected");
  });
  it("rejects tampering, missing parents and duplicate history", async () => {
    const f = releaseFixture(); const history = await publishRelease([], f.master, [f.policy], f.event);
    const changed = JSON.parse(JSON.stringify(history[0])); changed.master.factory = "Tampered";
    await expect(verifyRelease(changed)).rejects.toThrow(/integrity/);
    await expect(verifyReleaseHistory([history[0], history[0]])).rejects.toThrow(/lineage/);
    const second = await publishRelease(history, f.master, [f.policy], f.event);
    await expect(verifyReleaseHistory([second[1]])).rejects.toThrow(/lineage/);
  });
  it("blocks overlapping intervals including inclusive boundary collisions", async () => {
    const f = releaseFixture();
    const other = revisePolicyGovernance(f.policy, { from: "2026-06-30", through: null }, f.policy.confidence, f.event);
    await expect(publishRelease([], f.master, [f.policy, other], f.event)).rejects.toThrow(/Overlapping/);
    other.effectiveDates.from = "2026-07-01";
    const history = await publishRelease([], f.master, [f.policy, other], f.event);
    expect(policyCoverage(history[0], "material-cost", "2026-01-01", "2026-12-31")).toEqual([]);
  });
  it("reports date gaps and never uses a future/latest rate", async () => {
    const f = releaseFixture(); const [release] = await publishRelease([], f.master, [f.policy], f.event);
    expect(resolvePolicy(release, "material-cost", "2026-07-01", true).status).toBe("gap");
    expect(resolvePolicy(release, "material-cost", "2026-06-01").status).toBe("provisional_blocked");
    expect(policyCoverage(release, "material-cost", "2026-01-01", "2026-12-31")).toEqual([{ from: "2026-07-01", through: "2026-12-31" }]);
    expect(() => resolvePolicy(release, "material-cost", "2026-02-30")).toThrow();
  });
  it("requires fresh approval when editing a confirmed policy", async () => {
    const f = releaseFixture(); const approved = approvePolicy(f.policy, { approvedBy: "Reviewer", approvedAt: f.event.at, reason: "Test", evidenceReference: "test:approval" });
    const old = await publishRelease([], f.master, [approved], f.event);
    approved.effectiveDates.through = "2026-12-31";
    await expect(publishRelease(old, f.master, [approved], f.event)).rejects.toThrow(/fresh approval/);
    const revised = revisePolicyGovernance(approved, { from: "2026-01-01", through: null }, approved.confidence, f.event);
    expect(revised.status).toBe("provisional"); expect((await publishRelease(old, f.master, [revised], f.event)).length).toBe(2);
  });
  it("pins and reproduces an old result after explicit retrospective revision", async () => {
    const f = releaseFixture(); let history = await publishRelease([], f.master, [f.policy], f.event);
    const run = await pinCalculation(history[0], "material-cost", f.request, await fingerprint("synthetic source"));
    f.master.revision++; f.master.sections.overheads = [];
    history = await publishRelease(history, f.master, [f.policy], f.event);
    expect((await verifyPinnedRun(run, history)).result.exactValue).toEqual({ numerator: "50", denominator: "1" });
    const changed = JSON.parse(JSON.stringify(run)); changed.result.exactValue.numerator = "999";
    await expect(verifyPinnedRun(changed, history)).rejects.toThrow(/integrity/);
  });
  it("blocks factory changes and inconsistent formula metadata", async () => {
    const f = releaseFixture(); const old = await publishRelease([], f.master, [f.policy], f.event);
    const other = { ...f.master, factory: "Different" };
    await expect(publishRelease(old, other, [f.policy], f.event)).rejects.toThrow(/factory/);
    f.policy.calculation.expression = "evil()";
    await expect(publishRelease([], f.master, [f.policy], f.event)).rejects.toThrow(/implemented/);
  });
});
