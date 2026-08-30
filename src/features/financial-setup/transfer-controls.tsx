"use client";

import { useEffect, useRef, useState } from "react";
import { emptyMaster, SECTION_KEYS, type FinancialMaster } from "@/core/financial/schema";

function download(data: BlobPart, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TransferControls({ master, onReplace }: { master: FinancialMaster; onReplace: (value: FinancialMaster) => void }) {
  const worker = useRef<Worker | null>(null);
  const token = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ master: FinancialMaster; warnings: string[] } | null>(null);
  useEffect(() => () => { token.current = null; worker.current?.terminate(); }, []);

  function cancel() { token.current = null; worker.current?.terminate(); worker.current = null; setBusy(false); setNotice("Import cancelled. Your draft was not changed."); }
  async function importFile(file: File) {
    if (!/\.(json|xlsx|xls)$/i.test(file.name)) { setNotice("Choose a financial-master .json, .xlsx or .xls file."); return; }
    if (file.size > 10 * 1024 * 1024) { setNotice("Financial master must be under 10 MB."); return; }
    worker.current?.terminate();
    const id = crypto.randomUUID(); token.current = id;
    setBusy(true); setPending(null); setNotice("Checking financial master locally…");
    try {
      const buffer = await file.arrayBuffer();
      if (token.current !== id) return;
      const instance = new Worker(new URL("../../workers/financial-master.worker.ts", import.meta.url), { type: "module" });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<{ requestId: string; error?: string; result?: { master: FinancialMaster; warnings: string[] } }>) => {
        if (event.data.requestId !== token.current) return;
        setBusy(false); instance.terminate(); worker.current = null;
        if (event.data.error) setNotice(event.data.error);
        else if (event.data.result) { setPending(event.data.result); setNotice("File checked. Review below before replacing the current draft."); }
      };
      instance.onerror = () => { if (token.current !== id) return; instance.terminate(); setBusy(false); setNotice("Import worker failed. Your current draft is unchanged."); };
      instance.postMessage({ requestId: id, buffer, fileName: file.name, mimeType: file.type }, [buffer]);
    } catch { if (token.current === id) { setBusy(false); setNotice("Unable to read the selected file. Your draft is unchanged."); } }
  }
  async function exportFile(format: "json" | "xlsx", template = false) {
    try {
      const io = await import("@/core/financial/portability");
      const value = template ? emptyMaster() : master;
      const filename = `3D-Financial-Master_${template ? "template" : `${master.factory.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "draft"}_r${master.revision}`}.${format}`;
      if (format === "json") download(io.exportMasterJson(value), "application/json", filename);
      else download(io.exportMasterExcel(value), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
      setNotice(template ? "Blank template downloaded. No example prices have been inserted." : "Draft exported, including incomplete entries. Review findings before using it for calculations.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Export failed. Your draft remains in memory."); }
  }
  return <details className="setup-card mt-5">
    <summary className="cursor-pointer text-sm font-semibold">Import, export & template</summary>
    <p className="setup-help mt-3">Excel is the standard editable format; JSON is a full-fidelity backup. Import replaces the entire draft only after confirmation. It never changes the MMS workbook.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="setup-secondary" onClick={() => void exportFile("xlsx", true)}>Download Excel template</button>
      <button className="setup-secondary" onClick={() => input.current?.click()} disabled={busy}>Import financial master</button>
      <input ref={input} aria-label="Import financial master file" className="sr-only" type="file" accept=".json,.xlsx,.xls" onChange={e => { if (e.target.files?.[0]) void importFile(e.target.files[0]); e.target.value = ""; }} />
      <button className="setup-secondary" onClick={() => void exportFile("xlsx")}>Export Excel</button>
      <button className="setup-secondary" onClick={() => void exportFile("json")}>Export JSON</button>
      {busy && <button className="setup-secondary" onClick={cancel}>Cancel import</button>}
    </div>
    <p role="status" className="setup-help mt-3">{notice}</p>
    {pending && <div className="setup-findings mt-4">
      <p className="font-semibold">Replace with {pending.master.factory || "unnamed factory"} · revision {pending.master.revision}?</p>
      <p>{SECTION_KEYS.reduce((count, key) => count + pending.master.sections[key].length, 0)} entries. Existing unsaved entries will be replaced.</p>
      {pending.warnings.map(w => <p key={w}>{w}</p>)}
      <div className="mt-3 flex gap-2"><button className="setup-button" onClick={() => { onReplace(pending.master); setPending(null); setNotice("Financial draft replaced. Check the Review section for missing or invalid inputs."); }}>Replace current draft</button><button className="setup-secondary" onClick={() => { setPending(null); setNotice("Import discarded. Existing draft retained."); }}>Keep current draft</button></div>
    </div>}
  </details>;
}
