"use client";

import { useRef, useState } from "react";
import type { MmsImportSummary } from "@/core/mms";
import { MmsImporter } from "@/features/importer/mms-importer";
import { FinancialSetupWizard } from "@/features/financial-setup/financial-setup-wizard";
import { PolicyWorkspace } from "@/features/policies/policy-workspace";
import { emptyMaster, type FinancialMaster } from "@/core/financial/schema";
import type { FinancialRelease } from "@/core/policy/releases";
import { emptyArchive, mergeArchives, type PolicyArchive } from "@/core/policy/portability";
import { ArchiveControls } from "@/features/policies/archive-controls";

export function AnalysisWorkspace() {
  const [step, setStep] = useState<"import" | "setup" | "policies">("import");
  const [master, setMaster] = useState(emptyMaster);
  const [archive, setArchive] = useState<PolicyArchive>(emptyArchive);
  const currentArchive = useRef(archive);
  const [setupSeed, setSetupSeed] = useState<FinancialMaster | undefined>(undefined);
  const [setupGeneration, setSetupGeneration] = useState(0);
  function commitArchive(next: PolicyArchive) {
    const current = currentArchive.current;
    if (current.releases.some((release, index) => next.releases[index]?.hash !== release.hash || next.releases[index]?.id !== release.id) || current.runs.some(run => !next.runs.some(nextRun => nextRun.id === run.id && nextRun.hash === run.hash))) throw new Error("The archive changed during this operation. Retry without replacing newer history.");
    currentArchive.current = next; setArchive(next);
  }
  function setHistory(history: readonly FinancialRelease[]) { commitArchive({ ...currentArchive.current, releases: history }); }
  async function mergeArchive(incoming: PolicyArchive) {
    const previous = currentArchive.current; const merged = await mergeArchives(previous, incoming);
    if (previous !== currentArchive.current) throw new Error("Archive changed while validating. Please retry the merge.");
    commitArchive(merged);
  }
  function restoreMaster(value: FinancialMaster) { setSetupSeed(value); setMaster(value); setSetupGeneration(current => current + 1); }
  const [source, setSource] = useState<MmsImportSummary | null>(null);
  return <main className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-5 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f766e] text-sm font-black text-white">3D</span><div><p className="text-sm font-bold">3D Profit Intelligence</p><p className="text-xs text-[var(--muted)]">Local-first financial workspace</p></div></div>
      <span className="text-xs text-[var(--muted)]">Private on your device · No cloud upload</span>
    </header>
    <nav className="my-6 flex flex-wrap gap-2" aria-label="Analysis workflow">
      <button className={step === "import" ? "setup-button" : "setup-secondary"} aria-current={step === "import" ? "step" : undefined} onClick={() => setStep("import")}>1 · Import data{source ? " ✓" : ""}</button>
      <button className={step === "setup" ? "setup-button" : "setup-secondary"} aria-current={step === "setup" ? "step" : undefined} onClick={() => setStep("setup")}>2 · Financial setup</button>
      <span className="inline-flex items-center px-3 text-xs text-[var(--muted)]">3 · Financial results — later phase</span>
      <button className="setup-secondary ml-auto" aria-current={step === "policies" ? "page" : undefined} onClick={() => setStep("policies")}>Policies & history</button>
    </nav>
    <div hidden={step !== "import"}>
      <div className="mb-5"><h1 className="text-3xl font-bold tracking-tight">Start with your MMS workbook.</h1><p className="mt-2 text-sm text-[var(--muted)]">Validation and processing are automatic. Review exceptions, then complete the missing financial inputs.</p></div>
      <MmsImporter onReady={setSource} onReset={() => setSource(null)} onContinue={() => setStep("setup")} />
      <p className="setup-help mt-4">Reported Qty is authoritative. Stroke × multiplier is a validation check, never a replacement.</p>
    </div>
    <div hidden={step !== "setup"}><FinancialSetupWizard key={setupGeneration} source={source} onMasterChange={setMaster} initialMaster={setupSeed} /></div>
    <div hidden={step !== "policies"}><PolicyWorkspace master={master} history={archive.releases} onHistory={setHistory} portability={<ArchiveControls archive={archive} onMerge={mergeArchive} onRestoreMaster={restoreMaster} />} /></div>
    <footer className="mt-10 border-t border-[var(--line)] py-5 text-xs text-[var(--muted)]">Financial setup and policy governance · Historical profit dashboard is a later phase.</footer>
  </main>;
}
