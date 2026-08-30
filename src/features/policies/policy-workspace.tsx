"use client";

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import type { FinancialMaster } from "@/core/financial/schema";
import { validateMaster } from "@/core/financial/validation";
import { createProvisionalFormulaPolicy } from "@/core/policy/evaluate";
import { listFormulaDefinitions } from "@/core/policy/formulas";
import { approvePolicy, policyCoverage, policyKey, publishRelease, revisePolicyGovernance, type FinancialRelease } from "@/core/policy/releases";
import type { FinancialPolicy } from "@/core/policy/schema";

const definitions = listFormulaDefinitions();
type Form = { formula: string; from: string; through: string; cap: string; high: string; medium: string; low: string };
const initial: Form = { formula: definitions[0].policyId, from: "", through: "", cap: "", high: "", medium: "", low: "" };
export function PolicyWorkspace({ master, history, onHistory, portability }: { master: FinancialMaster; history: readonly FinancialRelease[]; onHistory: (history: readonly FinancialRelease[]) => void; portability?: ReactNode }) {
  const [form, setForm] = useState<Form>(initial);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [actor, setActor] = useState(""); const [reason, setReason] = useState(""); const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [reviewRevision, setReviewRevision] = useState("");
  const latest = history.at(-1);
  const selected = latest?.policies.find(policy => policyKey(policy) === editingKey);
  const reviewed = history.find(release => String(release.revision) === reviewRevision) ?? latest;
  const definition = definitions.find(item => item.policyId === form.formula)!;
  const missing = validateMaster(master).filter(issue => issue.level === "missing").length;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || history.length) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, history.length]);
  function field(key: keyof Form, value: string) { setForm(current => ({ ...current, [key]: value })); setDirty(true); }
  function choose(key: string) {
    if (dirty && !window.confirm("Discard unsaved policy form changes?")) return;
    const policy = latest?.policies.find(policy => policyKey(policy) === key); if (!policy) return;
    setEditingKey(key); setDirty(false);
    const cap = policy.confidence.rules.find(rule => rule.condition === "provisional_policy")?.effect;
    setForm({ formula: policy.policyId, from: policy.effectiveDates.from, through: policy.effectiveDates.through ?? "", cap: cap?.kind === "cap" ? String(cap.maximumScore) : "", high: String(policy.confidence.bands?.high ?? ""), medium: String(policy.confidence.bands?.medium ?? ""), low: String(policy.confidence.bands?.low ?? "") });
  }
  async function save(approve: boolean) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const at = new Date().toISOString();
      let policy: FinancialPolicy;
      if (approve) {
        if (!selected || dirty) throw new Error("Save policy edits as provisional before approval.");
        policy = approvePolicy(selected, { approvedBy: actor, approvedAt: at, reason, evidenceReference: evidence });
      } else {
        if ([form.cap, form.high, form.medium, form.low].some(value => !/^\d+$/.test(value))) throw new Error("Enter explicit whole-number confidence caps and thresholds. No defaults are assumed.");
        const confidence: FinancialPolicy["confidence"] = { scoreMeaning: "evidence_not_probability", aggregation: "weakest_component_cap", bands: { high: Number(form.high), medium: Number(form.medium), low: Number(form.low) }, rules: [
          { id: "provisional-policy", condition: "provisional_policy", inputKey: null, effect: { kind: "cap", maximumScore: Number(form.cap) }, reason: "Provisional policy evidence limits confidence." },
          ...definition.inputs.flatMap(input => (["estimated_input", "provisional_input"] as const).map(condition => ({ id: `${input.key}-${condition.replaceAll("_", "-")}`, condition, inputKey: input.key, effect: { kind: "cap" as const, maximumScore: Number(form.cap) }, reason: `${input.key} is supported by an assumption rather than confirmed evidence.` }))),
        ] };
        const dates = { from: form.from, through: form.through || null };
        policy = selected ? revisePolicyGovernance(selected, dates, confidence, { actor, at, reason }) : createProvisionalFormulaPolicy(form.formula, "1.0.0", { createdAt: at, createdBy: actor, reason, effectiveDates: dates, confidence });
      }
      const policies = [...latest?.policies ?? []].filter(item => policyKey(item) !== editingKey);
      const next = await publishRelease(history, master, [...policies, policy], { actor, at, reason });
      onHistory(next); setEditingKey(policyKey(policy)); setDirty(false); setReviewRevision("");
      setNotice(`Release ${next.length} captured. ${approve ? "Approval recorded as self-declared." : "Policy remains provisional."} Earlier releases are unchanged.`);
    } catch (error) { setNotice(error instanceof z.ZodError ? error.issues.slice(0, 3).map(issue => `${issue.path.join(" / ")}: ${issue.message}`).join("\n") : error instanceof Error ? error.message : "Could not capture release; existing history is unchanged."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="policy-title">
    <div className="mb-5"><h1 id="policy-title" className="text-3xl font-bold">Financial policies</h1><p className="setup-help">Review rules, effective dates and approval history. This is separate from the main financial workflow.</p></div>
    <div className="setup-card mb-5"><p className="font-semibold">{master.factory || "Set a factory name in Financial setup first"}</p><p className="setup-help">{history.length} immutable releases · Current master draft revision {master.revision}. {missing > 0 ? `${missing} setup requirements remain missing; capturing a release does not make profit available.` : "Master readiness is checked separately from policy approval."}</p><p className="setup-help">Releases are local and initially session-only. Export a backup before closing. Self-declared approval is not authenticated maker-checker approval.</p></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="setup-card">
        <h2 className="text-lg font-bold">Published policy schedule</h2>
        {!latest ? <p className="setup-help">No policies published. No formula, date or confidence threshold has been selected for this factory.</p> : <ul className="mt-3 max-h-80 space-y-2 overflow-auto">{latest.policies.map(policy => <li key={policyKey(policy)}><button className="setup-secondary w-full text-left" disabled={busy} onClick={() => choose(policyKey(policy))}>{policy.formulaName}<span className="block text-xs">{policy.status} · {policy.effectiveDates.from} → {policy.effectiveDates.through ?? "open-ended"}</span></button></li>)}</ul>}
        <button className="setup-secondary mt-4" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved form changes?")) { setEditingKey(null); setForm(initial); setDirty(false); } }}>New policy / effective period</button>
        <details className="mt-5"><summary className="cursor-pointer font-semibold">Release history</summary>
          <label className="setup-label mt-3 block">Review release<select className="setup-input" value={reviewRevision} onChange={event => setReviewRevision(event.target.value)}><option value="">Latest release</option>{history.map(release => <option key={release.id} value={release.revision}>Release {release.revision} — {release.metadata.at}</option>)}</select></label>
          {reviewed && <div className="setup-help mt-3 break-words"><p>Release {reviewed.revision} · {reviewed.metadata.actor} · {reviewed.metadata.at}</p><p>Reason: {reviewed.metadata.reason}</p><p>Master snapshot revision: {reviewed.master.revision}</p><p>SHA-256: {reviewed.hash}</p>{reviewed.policies.map(policy => <p key={policyKey(policy)}>{policy.formulaName}: {policy.status}, {policy.effectiveDates.from} to {policy.effectiveDates.through ?? "open-ended"}; formula {policy.formulaVersion}</p>)}</div>}
        </details>
      </div>
      <div className="setup-card">
        <h2 className="text-lg font-bold">{selected ? "Revise selected policy" : "Create a provisional policy"}</h2>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="setup-label sm:col-span-2">Formula<select className="setup-input" disabled={!!selected} value={form.formula} onChange={event => field("formula", event.target.value)}>{definitions.map(item => <option key={item.policyId} value={item.policyId}>{item.formulaName}</option>)}</select></label>
          <label className="setup-label">Policy effective from<input type="date" className="setup-input" value={form.from} onInput={event => field("from", event.currentTarget.value)} /></label>
          <label className="setup-label">Policy effective through<input type="date" className="setup-input" value={form.through} onInput={event => field("through", event.currentTarget.value)} /></label>
          <label className="setup-label">Assumption confidence cap<input className="setup-input" inputMode="numeric" value={form.cap} onChange={event => field("cap", event.target.value)} /></label>
          {(["high", "medium", "low"] as const).map(key => <label key={key} className="setup-label">{key[0].toUpperCase() + key.slice(1)} confidence starts at<input className="setup-input" inputMode="numeric" value={form[key]} onChange={event => field(key, event.target.value)} /></label>)}
          <p className="setup-help sm:col-span-2">Evidence score, not probability. High &gt; medium &gt; low &gt; 0; cap 0–99. Values below low are “Very low”. These are explicit policy choices, not overrides of a result score.</p>
          <label className="setup-label">Recorded by<input className="setup-input" value={actor} onChange={event => setActor(event.target.value)} maxLength={200} /></label>
          <label className="setup-label">Change / approval reason<input className="setup-input" value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} /></label>
          <button className="setup-button sm:col-span-2" onClick={() => void save(false)}>{busy ? "Validating release…" : "Save provisional release"}</button>
        </fieldset>
        <details className="mt-5"><summary className="cursor-pointer font-semibold">Formula details and confidence rules</summary><p className="setup-help mt-3 break-words">{definition.calculation.expression}</p><p className="setup-help">{definition.description}</p><p className="setup-help">Source: {definition.specification}</p><ul className="mt-2 list-disc pl-5 text-sm">{definition.calculation.guards.map(guard => <li key={guard}>{guard}</li>)}</ul>
          {selected && <><p className="setup-help">Published confidence rules:</p><ul className="list-disc pl-5 text-xs">{selected.confidence.rules.map(rule => <li key={rule.id}>{rule.condition}{rule.inputKey ? ` (${rule.inputKey})` : ""}: {rule.effect.kind === "cap" ? `cap ${rule.effect.maximumScore}` : "unavailable"}. {rule.reason}</li>)}</ul><p className="setup-help">{master.scope.from && master.scope.to ? (() => { try { const gaps = policyCoverage(latest!, selected.policyId, master.scope.from, master.scope.to); return gaps.length ? `Date gaps: ${gaps.map(gap => `${gap.from}–${gap.through}`).join(", ")}` : "Policy dates cover the current analysis range."; } catch { return "Choose valid analysis dates to check policy coverage."; } })() : "Choose analysis dates in Financial setup to check policy coverage."}</p></>}
        </details>
        {selected && <details className="mt-5"><summary className="cursor-pointer font-semibold">Approval evidence</summary><p className="setup-help">Published status: {selected.status}. {selected.approval.state === "recorded" ? `Confirmed by ${selected.approval.approvedBy} at ${selected.approval.approvedAt}. Evidence: ${selected.approval.evidenceReference}` : selected.approval.reason}</p>
          <label className="setup-label mt-3 block">Written approval reference<input className="setup-input" value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={2000} /></label><button className="setup-secondary mt-3" disabled={busy || dirty || selected.status === "confirmed"} onClick={() => void save(true)}>Record self-declared approval in new release</button><p className="setup-help">Use the named reviewer and approval reason above. Unsaved policy edits must be saved as provisional before approval.</p>
        </details>}
      </div>
    </div>
    <p role="status" className="setup-help mt-4 whitespace-pre-wrap">{notice}</p>
    {portability}
  </section>;
}
