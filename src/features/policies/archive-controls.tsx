"use client";

import { useEffect, useRef, useState } from "react";
import type { FinancialMaster } from "@/core/financial/schema";
import { ARCHIVE_MAX_BYTES, exportArchive, type PolicyArchive } from "@/core/policy/portability";
import { deleteLocalArchive, loadLocalArchive, POLICY_STORAGE_KEY, saveLocalArchive, type ArchiveConsent } from "@/core/policy/local-archive";

export function ArchiveControls({ archive, onMerge, onRestoreMaster }: { archive: PolicyArchive; onMerge: (archive: PolicyArchive) => Promise<void>; onRestoreMaster: (master: FinancialMaster) => void }) {
  const [consent, setConsent] = useState<ArchiveConsent | null>(null);
  const [days, setDays] = useState(30); const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PolicyArchive | null>(null); const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const worker = useRef<Worker | null>(null); const generation = useRef(0); const saveController = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; worker.current?.terminate(); saveController.current?.abort(); }, []);
  useEffect(() => {
    if (!consent) return;
    const controller = new AbortController(); saveController.current = controller;
    const timeout = setTimeout(() => {
      void saveLocalArchive(localStorage, archive, consent, controller.signal).then(() => {
        if (!controller.signal.aborted) setNotice("Policy archive saved locally. Storage is unencrypted; keep an exported backup.");
      }).catch(() => { if (!controller.signal.aborted) { setNotice("Local saving failed or expired. Your archive remains in memory; export a backup or restore newer saved history."); setConsent(null); } });
    }, 400);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [archive, consent]);
  useEffect(() => {
    if (!consent) return;
    const expire = () => {
      if (Date.parse(consent.consentAt) + consent.retentionDays * 86400000 > Date.now()) return;
      saveController.current?.abort(); setConsent(null);
      try {
        const raw = localStorage.getItem(POLICY_STORAGE_KEY);
        if (raw && JSON.parse(raw).consentAt === consent.consentAt) deleteLocalArchive(localStorage);
        setNotice("Policy archive retention expired. The saved copy was removed; this in-memory session is unchanged.");
      } catch { setNotice("Retention expired, but browser storage could not be accessed. Delete the saved copy when storage is available."); }
    };
    const timer = setInterval(expire, 60_000); return () => clearInterval(timer);
  }, [consent]);
  function cancelImport() { generation.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setImporting(false); setPending(null); setNotice("Import cancelled; current history is unchanged."); }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (!/\.json$/i.test(file.name) || !["", "application/json", "text/plain"].includes(file.type) || file.size > ARCHIVE_MAX_BYTES) { setNotice("Choose a JSON policy archive no larger than 10 MB."); return; }
    worker.current?.terminate(); const token = ++generation.current; setBusy(true); setImporting(true); setPending(null);
    try {
      const buffer = await file.arrayBuffer(); if (token !== generation.current) return;
      const instance = new Worker(new URL("../../workers/policy-archive.worker.ts", import.meta.url), { type: "module" }); worker.current = instance;
      instance.onmessage = event => {
        if (token !== generation.current) return;
        instance.terminate(); worker.current = null; setBusy(false); setImporting(false);
        if (event.data.status === "ready") { setPending(event.data.archive); setNotice("Archive checked. Review the preview before merging."); }
        else setNotice("Archive validation failed. Check its format, integrity and version history; current data is unchanged.");
      };
      instance.onerror = () => { if (token === generation.current) { instance.terminate(); worker.current = null; setBusy(false); setImporting(false); setNotice("Archive import failed; current data is unchanged."); } };
      instance.postMessage({ id: String(token), buffer }, [buffer]);
    } catch { if (token === generation.current) { setBusy(false); setImporting(false); setNotice("Could not read archive; current history is unchanged."); } }
  }
  async function mergePending() {
    if (!pending) return; setBusy(true);
    try { await onMerge(pending); setPending(null); setNotice("Archive merged without overwriting existing versions. Restore its master snapshot below only if needed."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Conflicting archive; no changes applied."); }
    finally { setBusy(false); }
  }
  async function restoreSaved() {
    setBusy(true);
    try { const saved = await loadLocalArchive(localStorage); setPending(saved?.archive ?? null); setNotice(saved ? "Saved archive checked. Review and merge; saving consent remains unchanged." : "No unexpired saved policy archive exists."); }
    catch { setNotice("Saved archive is damaged, incompatible or unavailable. It was not applied."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true);
    try {
      const raw = await exportArchive(archive); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "3D-Policy-Archive.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Archive exported. It contains sensitive financial snapshots and evidence; store it securely.");
    } catch { setNotice("Export failed. Current history remains in memory."); }
    finally { setBusy(false); }
  }
  function withdraw() {
    saveController.current?.abort(); setConsent(null);
    try { deleteLocalArchive(localStorage); setNotice("Saved policy archive deleted and consent withdrawn. In-memory releases and Financial Setup drafts are unchanged."); }
    catch { setNotice("Saving stopped, but the stored copy could not be deleted. Retry deletion when browser storage is available."); }
  }
  const latest = archive.releases.at(-1);
  return <details className="setup-card mt-5"><summary className="cursor-pointer font-semibold">Policy backup, restore & privacy</summary>
    <p className="setup-help mt-3">JSON preserves all releases and pinned calculations. This is separate from Financial Setup Excel/JSON. Nothing is uploaded. Saved archives are unencrypted and readable by others using this browser profile.</p>
    <div className="mt-4 flex flex-wrap gap-3"><button className="setup-secondary" disabled={busy || !latest} onClick={() => void download()}>Export policy archive</button><label className="setup-label">Import policy archive<input aria-label="Import policy archive" type="file" accept=".json,application/json" disabled={busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label>{importing && <button className="setup-secondary" onClick={cancelImport}>Cancel archive import</button>}</div>
    {pending && <div className="mt-4 rounded-lg border border-[var(--line)] p-4"><p className="text-sm font-semibold">Archive preview: {pending.releases.at(-1)?.master.factory ?? "empty archive"}</p><p className="setup-help">{pending.releases.length} releases · {pending.runs.length} pinned calculations. Conflicting histories will be rejected.</p><div className="mt-3 flex gap-3"><button className="setup-button" disabled={busy} onClick={() => void mergePending()}>Merge verified history</button><button className="setup-secondary" disabled={busy} onClick={() => setPending(null)}>Keep current history</button></div></div>}
    <div className="mt-5 flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!consent} disabled={busy} onChange={event => {
      if (!event.target.checked) { withdraw(); return; }
      if (!Number.isInteger(days) || days < 1 || days > 90) { setNotice("Retention must be 1–90 days."); return; }
      setConsent({ granted: true, consentAt: new Date().toISOString(), retentionDays: days }); setNotice("Consent granted. Saving after validation…");
    }} />I consent to saving the policy archive locally</label><label className="setup-label">Archive retention days<input type="number" min="1" max="90" className="setup-input max-w-28" disabled={!!consent} value={days} onChange={event => setDays(Number(event.target.value))} /></label></div>
    <div className="mt-4 flex flex-wrap gap-3"><button className="setup-secondary" disabled={busy} onClick={() => void restoreSaved()}>Preview saved policy archive</button><button className="setup-secondary" onClick={withdraw}>Delete saved policy archive & stop saving</button>
      <button className="setup-secondary" disabled={!latest || busy} onClick={() => { if (latest && window.confirm("Replace the current Financial Setup draft with this release's master snapshot? Unsaved setup edits will be replaced. MMS input and archive history remain unchanged.")) { onRestoreMaster(structuredClone(latest.master) as FinancialMaster); setNotice("Latest master snapshot restored into Financial Setup. Review it before editing or publishing."); } }}>Restore latest master into setup</button></div>
    <p role="status" className="setup-help mt-3">{notice}</p>
  </details>;
}
