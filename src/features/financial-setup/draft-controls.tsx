"use client";

import { useEffect, useState } from "react";
import { deleteDraft, loadDraft, saveDraft } from "@/core/financial/draft-storage";
import type { FinancialMaster } from "@/core/financial/schema";

export function DraftControls({ master, onRestore }: { master: FinancialMaster; onRestore: (master: FinancialMaster) => void }) {
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [savingFailed, setSavingFailed] = useState(false);
  const [notice, setNotice] = useState("This session is not saving. Restore an existing draft if needed.");

  useEffect(() => {
    if (!consentAt) return;
    const persist = () => {
      try {
        const result = saveDraft(localStorage, master, { granted: true, consentAt, retentionDays: days });
        setSavingFailed(false);
        setNotice(`Draft saved on this browser. Expires ${result.expiresAt.slice(0, 10)}. Raw MMS rows are not saved.`);
      } catch {
        setSavingFailed(true);
        setNotice("Draft could not be saved. Storage may be full, blocked or consent may have expired. Export a backup or renew consent.");
      }
    };
    const timeout = setTimeout(persist, 400);
    window.addEventListener("pagehide", persist);
    return () => { clearTimeout(timeout); window.removeEventListener("pagehide", persist); };
  }, [master, consentAt, days]);

  useEffect(() => {
    const hasWork = master.factory || master.scope.from || Object.values(master.sections).some(rows => rows.length);
    if ((consentAt && !savingFailed) || !hasWork) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [master, consentAt, savingFailed]);

  function consent(granted: boolean) {
    if (granted) {
      const timestamp = new Date().toISOString();
      try {
        saveDraft(localStorage, master, { granted: true, consentAt: timestamp, retentionDays: days });
        setConsentAt(timestamp);
        setNotice("Local saving enabled with your consent.");
      } catch { setNotice("Could not enable local saving. Your draft remains in memory; export a backup."); }
    } else {
      setConsentAt(null);
      try { deleteDraft(localStorage); setNotice("Saved draft deleted. Consent withdrawn; current work remains in memory."); }
      catch { setNotice("Saving stopped, but the saved draft could not be deleted. Clear this site's storage in browser settings."); }
    }
  }

  function restore() {
    try {
      const saved = loadDraft(localStorage);
      if (!saved) { setNotice("No unexpired draft was found on this browser."); return; }
      if (!window.confirm("Replace the current financial draft with the locally saved draft? Export your current work first if needed.")) return;
      // Restoration is not fresh consent to overwrite local storage.
      setConsentAt(null);
      onRestore(saved.master);
      setNotice(`Restored revision ${saved.master.revision}. Automatic saving is off; enable it again if desired.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Local draft could not be read."); }
  }

  return <details className="setup-card mt-5">
    <summary className="cursor-pointer text-sm font-semibold">Privacy & local draft</summary>
    <p className="setup-help mt-3">Optional, unencrypted storage on this browser profile. Anyone with access to this profile may read it. Avoid shared computers. Financial exports also contain sensitive data.</p>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(consentAt)} onChange={e => consent(e.target.checked)} className="h-5 w-5" />I consent to saving this financial draft locally</label>
      <label className="setup-label">Retention (days)<input className="setup-input max-w-28" type="number" min={1} max={90} value={days} disabled={Boolean(consentAt)} onChange={e => setDays(Number(e.target.value))} /></label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><button className="setup-secondary" onClick={restore} type="button">Restore saved draft</button><button className="setup-secondary" onClick={() => consent(false)} type="button">Delete saved draft & stop saving</button></div>
    <p role="status" className="setup-help mt-3">{notice}</p>
  </details>;
}
