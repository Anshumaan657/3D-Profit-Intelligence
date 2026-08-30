import { parseMaster, type FinancialMaster } from "./schema";

export const DRAFT_KEY = "3d-profit-intelligence:financial-draft:v1";
export type SavedDraft = { version: 1; consentAt: string; expiresAt: string; master: FinancialMaster };
export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function saveDraft(storage: DraftStore, master: FinancialMaster, consent: { granted: boolean; consentAt: string; retentionDays: number }, now = Date.now()): SavedDraft {
  if (!consent.granted) throw new Error("Local storage consent is required.");
  if (!Number.isInteger(consent.retentionDays) || consent.retentionDays < 1 || consent.retentionDays > 90) throw new Error("Retention must be between 1 and 90 days.");
  const start = Date.parse(consent.consentAt);
  const end = start + consent.retentionDays * 86_400_000;
  if (!Number.isFinite(start) || start > now || end <= now) throw new Error("Local draft consent has expired. Please renew it.");
  const saved: SavedDraft = { version: 1, consentAt: consent.consentAt, expiresAt: new Date(end).toISOString(), master: parseMaster(master) };
  storage.setItem(DRAFT_KEY, JSON.stringify(saved));
  return saved;
}
export function loadDraft(storage: DraftStore, now = Date.now()): SavedDraft | null {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return null;
  if (raw.length > 10 * 1024 * 1024) throw new Error("Saved draft exceeds safe limits. Delete the saved draft and restore a backup.");
  let value: SavedDraft;
  try { value = JSON.parse(raw); } catch { throw new Error("Saved draft is damaged. Delete it or restore a backup."); }
  if (!value || typeof value !== "object") throw new Error("Saved draft has invalid consent metadata.");
  const start = Date.parse(value.consentAt), end = Date.parse(value.expiresAt);
  if (value.version !== 1 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 90 * 86_400_000 || start > now) throw new Error("Saved draft has invalid consent metadata.");
  if (end <= now) { storage.removeItem(DRAFT_KEY); return null; }
  return { ...value, master: parseMaster(value.master) };
}
export function deleteDraft(storage: DraftStore): void { storage.removeItem(DRAFT_KEY); }
