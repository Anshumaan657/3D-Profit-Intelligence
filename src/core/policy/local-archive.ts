import { z } from "zod";
import { importArchive, mergeArchives, verifyArchive, type PolicyArchive } from "./portability";
import type { DraftStore } from "../financial/draft-storage";

export const POLICY_STORAGE_KEY = "3d-profit-intelligence:policy-archive:v1";
const LOCAL_MAX_BYTES = 4 * 1024 * 1024;
const consentSchema = z.object({ granted: z.literal(true), consentAt: z.iso.datetime(), retentionDays: z.number().int().min(1).max(90) }).strict();
export type ArchiveConsent = z.infer<typeof consentSchema>;
const savedSchema = z.object({ version: z.literal(1), consentAt: z.iso.datetime(), expiresAt: z.iso.datetime(), archive: z.unknown() }).strict();
export async function saveLocalArchive(storage: DraftStore, archive: PolicyArchive, consentValue: ArchiveConsent, signal?: AbortSignal, clock = Date.now): Promise<void> {
  const consent = consentSchema.parse(consentValue);
  const start = Date.parse(consent.consentAt), end = start + consent.retentionDays * 86400000;
  const original = storage.getItem(POLICY_STORAGE_KEY);
  const checked = await verifyArchive(archive);
  if (original) {
    const saved = savedSchema.parse(JSON.parse(original));
    if (Date.parse(saved.expiresAt) > clock()) {
      const previous = await importArchive(JSON.stringify(saved.archive));
      const merged = await mergeArchives(previous, checked);
      if (merged.releases.length > checked.releases.length || merged.runs.length > checked.runs.length) throw new Error("The saved backup is newer. Restore it before saving this session.");
    }
  }
  const raw = JSON.stringify({ version: 1, consentAt: consent.consentAt, expiresAt: new Date(end).toISOString(), archive: checked });
  if (new TextEncoder().encode(raw).byteLength > LOCAL_MAX_BYTES) throw new Error("Archive exceeds the 4 MB local-storage limit. Export a JSON backup instead.");
  if (signal?.aborted) throw new Error("Saving cancelled; consent was withdrawn or the workspace changed.");
  if (start > clock() || end <= clock()) throw new Error("Local consent has expired; renew it to save again.");
  if (storage.getItem(POLICY_STORAGE_KEY) !== original) throw new Error("Another session changed the saved archive. Restore before saving.");
  storage.setItem(POLICY_STORAGE_KEY, raw);
}
export async function loadLocalArchive(storage: DraftStore, now = Date.now()) {
  const raw = storage.getItem(POLICY_STORAGE_KEY);
  if (!raw) return null;
  if (raw.length > LOCAL_MAX_BYTES) throw new Error("Saved archive exceeds safe limits.");
  const saved = savedSchema.parse(JSON.parse(raw));
  const start = Date.parse(saved.consentAt), end = Date.parse(saved.expiresAt);
  if (start > now || end <= start || end - start > 90 * 86400000) throw new Error("Invalid saved consent metadata.");
  if (end <= now) { if (storage.getItem(POLICY_STORAGE_KEY) === raw) storage.removeItem(POLICY_STORAGE_KEY); return null; }
  return { ...saved, archive: await importArchive(JSON.stringify(saved.archive)) };
}
export function deleteLocalArchive(storage: DraftStore): void { storage.removeItem(POLICY_STORAGE_KEY); }
