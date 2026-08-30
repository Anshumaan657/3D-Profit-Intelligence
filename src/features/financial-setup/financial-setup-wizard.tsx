"use client";

import { useEffect, useMemo, useState } from "react";
import { COMMON_FIELDS, emptyMaster, fieldsFor, newRow, revise, SECTION_KEYS, SECTIONS, type FinancialMaster, type SectionKey } from "@/core/financial/schema";
import { calendarDay, keyOf, validateMaster, type SetupIssue } from "@/core/financial/validation";
import type { MmsImportSummary } from "@/core/mms";
import { DraftControls } from "./draft-controls";
import { TransferControls } from "./transfer-controls";
import { ReviewFindings } from "./review-findings";

type Step = "factory" | SectionKey | "review";
const STEPS: Step[] = ["factory", ...SECTION_KEYS, "review"];
const title = (step: Step) => step === "factory" ? "Factory & dates" : step === "review" ? "Review setup" : SECTIONS[step].title;

export function FinancialSetupWizard({ source, onMasterChange, initialMaster }: { source: MmsImportSummary | null; onMasterChange?: (master: FinancialMaster) => void; initialMaster?: FinancialMaster }) {
  const [master, setMaster] = useState<FinancialMaster>(() => initialMaster ?? emptyMaster());
  useEffect(() => { onMasterChange?.(master); }, [master, onMasterChange]);
  const [step, setStep] = useState<Step>("factory");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const issues = useMemo(() => validateMaster(master, source?.catalog), [master, source]);
  const errors = issues.filter(i => i.level === "error").length;
  const missing = issues.filter(i => i.level === "missing").length;
  const count = SECTION_KEYS.reduce((total, key) => total + master.sections[key].length, 0);
  const section = step !== "factory" && step !== "review" ? step : null;
  const filtered = section ? master.sections[section].filter(row => SECTIONS[section].identity.some(key => keyOf(row.values[key]).includes(keyOf(search)))) : [];
  const visible = filtered.slice(page * 12, page * 12 + 12);
  const selected = section ? master.sections[section].find(row => row.id === selectedId) ?? visible[0] : undefined;
  const selectedIssues = issues.filter(i => i.rowId === selected?.id);

  function go(next: Step, rowId: string | null = null) { setStep(next); setSelectedId(rowId); setSearch(""); setPage(0); }
  function update(changes: Partial<FinancialMaster>) { setMaster(current => revise(current, changes)); }
  function replace(value: FinancialMaster) { setMaster(value); setNotice("Draft loaded. MMS source is unchanged; review mappings if this is a different factory."); go("review"); }
  function updateRow(field: string, value: string) {
    if (!section || !selected) return;
    setMaster(current => revise(current, { sections: { ...current.sections, [section]: current.sections[section].map(row => row.id !== selected.id ? row : { ...row, values: { ...row.values, ...(row.values.status === "confirmed" && !["status", "approvedBy", "note"].includes(field) ? { status: "draft", approvedBy: "" } : {}), [field]: value } }) } }));
  }
  function addRow(copy = false) {
    if (!section) return;
    if (count >= 10_000) { setNotice("The financial-master limit is 10,000 entries."); return; }
    const row = newRow(section);
    if (copy && selected) row.values = { ...selected.values, status: "draft", approvedBy: "", effectiveFrom: "", effectiveTo: "" };
    else row.values.effectiveFrom = master.scope.from;
    update({ sections: { ...master.sections, [section]: [...master.sections[section], row] } });
    setSelectedId(row.id); setSearch(""); setNotice(copy ? "New rate period created. Set dates without overlapping the previous rate." : "New draft entry added.");
  }
  function seedSource() {
    if (!source) return;
    let added = 0;
    const sections = { ...master.sections };
    for (const key of ["products", "machines"] as const) {
      const names = source.catalog[key];
      const field = key === "products" ? "productId" : "machineId";
      const existing = new Set(sections[key].map(row => keyOf(row.values[field])));
      const rows = [];
      for (const name of names) {
        if (existing.has(keyOf(name)) || count + added >= 10_000) continue;
        const row = newRow(key);
        row.values[field] = name; row.values.name = name;
        row.values.effectiveFrom = master.scope.from || source.dateRange?.[0] || "";
        if (key === "machines") row.values.rateMode = "consolidated";
        rows.push(row); existing.add(keyOf(name)); added++;
      }
      sections[key] = [...sections[key], ...rows];
    }
    update({ sections, factory: master.factory || source.source.company, scope: { from: master.scope.from || source.dateRange?.[0] || "", to: master.scope.to || source.dateRange?.[1] || "" } });
    setNotice(`${added} MMS item names added. No financial rates or units were assumed. Existing entries were preserved.`);
  }
  function showIssue(issue: SetupIssue) { go(issue.section === "setup" ? "factory" : issue.section, issue.rowId); }

  return <section aria-labelledby="setup-title">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--brand)]">Phase 3 · Financial master</p><h1 id="setup-title" className="mt-2 text-3xl font-bold tracking-tight">Set up your financial inputs.</h1><p className="mt-2 text-sm text-[var(--muted)]">Fill what you know. Keep unknown amounts blank. You can return to any section.</p></div>
      <span className="rounded-full border border-[var(--line)] px-3 py-2 text-xs">Draft revision {master.revision} · INR</span>
    </div>
    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Financial setup sections" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
        {STEPS.map((item, index) => <button key={item} type="button" aria-current={step === item ? "step" : undefined} onClick={() => go(item)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${step === item ? "bg-[var(--panel)] font-semibold text-white" : "text-[var(--muted)] hover:bg-[var(--surface)]"}`}><span className="text-xs opacity-70">{String(index + 1).padStart(2, "0")}</span>{title(item)}</button>)}
      </nav>
      <div className="min-w-0">
        {step === "factory" && <div className="setup-card">
          <h2 className="text-xl font-bold">Factory & analysis dates</h2>
          <p className="setup-help">Analysis dates choose the period you want to inspect. The factory calendar defines which days and shifts are planned to operate. They are separate settings.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="setup-label">Factory name<input className="setup-input" value={master.factory} maxLength={200} onChange={e => update({ factory: e.target.value })} placeholder="Example: Acme Manufacturing" /></label>
            <label className="setup-label">Factory timezone<input className="setup-input" value={master.timezone} onChange={e => update({ timezone: e.target.value })} /><span className="setup-help block">Default: Asia/Kolkata. Currency is INR.</span></label>
            <label className="setup-label">Analysis from<input type="date" className="setup-input" value={master.scope.from} onInput={e => update({ scope: { ...master.scope, from: e.currentTarget.value } })} /></label>
            <label className="setup-label">Analysis through<input type="date" className="setup-input" value={master.scope.to} min={master.scope.from || undefined} onInput={e => update({ scope: { ...master.scope, to: e.currentTarget.value } })} /></label>
          </div>
          {source ? <div className="mt-5 rounded-xl bg-[var(--canvas)] p-4 text-sm"><p className="font-semibold">MMS workbook connected: {source.source.fileName}</p><p className="setup-help">Coverage: {source.dateRange?.join(" → ") || "Unknown"}. {source.catalog.products.length} products and {source.catalog.machines.length} machines.</p><button type="button" className="setup-secondary mt-3" onClick={seedSource}>Use MMS names & available dates</button></div> : <p className="setup-findings mt-5">No MMS workbook is connected. You can prepare a reusable financial master now; source matching will be checked after import.</p>}
          {source?.dateRange && (master.scope.from < source.dateRange[0] || master.scope.to > source.dateRange[1]) && <p className="setup-findings mt-3">The selected range extends beyond MMS coverage. Those dates have no historical evidence from this workbook.</p>}
          {issues.filter(i => i.section === "setup").map((issue, index) => <p className="setup-findings mt-3" key={index}>{issue.message}</p>)}
        </div>}

        {section && <div className="setup-card">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{SECTIONS[section].title}</h2><p className="setup-help max-w-2xl">{SECTIONS[section].description}</p></div><button className="setup-button" onClick={() => addRow()} type="button">+ Add entry</button></div>
          {master.sections[section].length > 0 ? <>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="setup-label min-w-40 flex-1">Find an entry<input className="setup-input" value={search} onChange={e => { setSearch(e.target.value); setPage(0); setSelectedId(null); }} placeholder="Search by identifier" /></label>
              <label className="setup-label min-w-48 flex-[2]">Edit entry<select className="setup-input" value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value)}>{selected && !visible.some(row => row.id === selected.id) && <option value={selected.id}>{SECTIONS[section].identity.map(key => selected.values[key]).filter(Boolean).join(" · ") || "Untitled entry"}</option>}{visible.map((row, index) => <option key={row.id} value={row.id}>{SECTIONS[section].identity.map(key => row.values[key]).filter(Boolean).join(" · ") || `Untitled entry ${page * 12 + index + 1}`} · {row.values.effectiveFrom || "No start date"}</option>)}</select></label>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)]"><span>{filtered.length} entries</span><button className="min-h-9 underline" disabled={page === 0} onClick={() => { setPage(p => p - 1); setSelectedId(null); }}>Previous page</button><button className="min-h-9 underline" disabled={(page + 1) * 12 >= filtered.length} onClick={() => { setPage(p => p + 1); setSelectedId(null); }}>Next page</button></div>
            {selected ? <>
              <div className="mt-5 grid gap-x-5 gap-y-6 sm:grid-cols-2">
                {fieldsFor(section).map(field => {
                  const value = selected.values[field.key];
                  const findings = selectedIssues.filter(i => i.field === field.key && i.level !== "warning");
                  const id = `${section}-${field.key}`;
                  const common = { id, className: "setup-input", value, "aria-invalid": findings.length > 0, "aria-describedby": `${id}-help`, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateRow(field.key, e.target.value) };
                  return <div key={field.key} className={field.key === COMMON_FIELDS[0].key ? "border-t border-[var(--line)] pt-5 sm:col-span-2" : ""}>
                    <label htmlFor={id} className="setup-label">{field.label}{field.required ? " *" : ""}</label>
                    {field.kind === "select" ? <select {...common}><option value="">Not supplied</option>{field.options?.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select> : <input {...common} onChange={field.kind === "date" ? undefined : common.onChange} onInput={field.kind === "date" ? e => updateRow(field.key, e.currentTarget.value) : undefined} maxLength={2000} type={field.kind === "date" ? "date" : "text"} inputMode={field.kind === "number" ? "decimal" : undefined} />}
                    <div id={`${id}-help`} className="setup-help">{field.help && <p>{field.help}</p>}{field.kind === "number" && <p>{value === "" ? "Missing — not treated as zero." : Number(value) === 0 && value.trim() ? "Explicit zero — verify this is correct." : "Rate retained at source precision."}</p>}{findings.map((finding, index) => <p className="font-medium text-[var(--ink)]" key={index}>{finding.message}</p>)}</div>
                  </div>;
                })}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4"><button className="setup-secondary" onClick={() => addRow(true)}>Copy to new effective period</button><button className="min-h-11 px-2 text-sm text-[var(--muted)] underline" onClick={() => { if (window.confirm("Remove this entry from the current draft? Previously exported backups are not changed.")) { update({ sections: { ...master.sections, [section]: master.sections[section].filter(row => row.id !== selected.id) } }); setSelectedId(null); } }}>Remove entry</button><span className="text-xs text-[var(--muted)]">Editing a confirmed rate returns it to draft.</span></div>
            </> : <p className="mt-5 text-sm">No entries match this search.</p>}
          </> : <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] p-7 text-center"><p className="font-semibold">No {SECTIONS[section].title.toLowerCase()} supplied yet.</p><p className="setup-help">Add an entry, or import the financial-master template. Skipping does not mean zero.</p></div>}
        </div>}

        {step === "review" && <div className="setup-card">
          <h2 className="text-xl font-bold">Review your financial setup</h2><p className="setup-help">This checks inputs, date coverage and mappings. It does not calculate profit or certify financial policy.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Entries", count], ["Invalid / conflicting", errors], ["Missing inputs", missing]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--canvas)] p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
          <p className="setup-findings mt-5">{errors || missing ? "Draft retained with incomplete setup. Fix invalid entries and supply missing rates before complete financial analysis." : "Configuration checks passed for supplied entries. Review warnings and confirm assumptions before the calculation phase."}</p>
          {!source && <p className="setup-findings mt-3">Source coverage is unverified until an MMS workbook is imported.</p>}
          <div className="mt-5 space-y-2">{STEPS.filter(s => s !== "review").map(item => {
            const matches = issues.filter(i => i.section === (item === "factory" ? "setup" : item));
            return <button key={item} onClick={() => go(item)} className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3 text-sm"><span>{title(item)}</span><span className="text-[var(--muted)]">{matches.length ? `${matches.length} findings →` : "No findings →"}</span></button>;
          })}</div>
          <ReviewFindings issues={issues} onSelect={showIssue} />
          {master.scope.from && <p className="setup-help mt-5">Calendar preview for {master.scope.from}: {(() => { const day = calendarDay(master, master.scope.from); return !day ? "Unconfigured" : day.working ? `${day.shifts} shifts × ${day.paidHours} paid hours (draft schedule)` : "Non-working day / shutdown"; })()}</p>}
        </div>}
        <div className="mt-5 flex items-center justify-between"><button className="setup-secondary" disabled={step === "factory"} onClick={() => go(STEPS[STEPS.indexOf(step) - 1])}>← Back</button><span className="text-xs text-[var(--muted)]">{STEPS.indexOf(step) + 1} of {STEPS.length}</span><button className="setup-button" disabled={step === "review"} onClick={() => go(STEPS[STEPS.indexOf(step) + 1])}>{step === "aliases" ? "Review setup →" : "Next section →"}</button></div>
        <p role="status" className="setup-help mt-3">{notice}</p>
        <TransferControls master={master} onReplace={replace} />
        <DraftControls master={master} onRestore={replace} />
      </div>
    </div>
  </section>;
}
