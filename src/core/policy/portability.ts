import { z } from "zod";
import { immutable, verifyPinnedRun, verifyReleaseHistory, type FinancialRelease, type PinnedRun } from "./releases";

export const ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
export type PolicyArchive = Readonly<{ schemaVersion: 1; kind: "financial-policy-archive"; releases: readonly FinancialRelease[]; runs: readonly PinnedRun[] }>;
export const emptyArchive = (): PolicyArchive => ({ schemaVersion: 1, kind: "financial-policy-archive", releases: [], runs: [] });
const boundary = z.object({ schemaVersion: z.literal(1), kind: z.literal("financial-policy-archive"), releases: z.array(z.unknown()).max(100), runs: z.array(z.unknown()).max(1000) }).strict();
export async function verifyArchive(value: unknown): Promise<PolicyArchive> {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ARCHIVE_MAX_BYTES) throw new Error("Policy archive exceeds 10 MB.");
  const parsed = boundary.parse(value);
  const releases = await verifyReleaseHistory(parsed.releases);
  const runs: PinnedRun[] = [];
  for (const value of parsed.runs) {
    const run = await verifyPinnedRun(value, releases);
    if (runs.some(existing => existing.id === run.id)) throw new Error("Duplicate pinned calculation ID.");
    runs.push(run);
  }
  return immutable({ ...parsed, releases, runs });
}
export async function importArchive(raw: string): Promise<PolicyArchive> {
  if (raw.length > ARCHIVE_MAX_BYTES || new TextEncoder().encode(raw).byteLength > ARCHIVE_MAX_BYTES) throw new Error("Policy archive exceeds 10 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Not valid policy archive JSON."); }
  return verifyArchive(parsed);
}
export async function exportArchive(archive: PolicyArchive): Promise<string> {
  const raw = JSON.stringify(await verifyArchive(archive), null, 2);
  if (new TextEncoder().encode(raw).byteLength > ARCHIVE_MAX_BYTES) throw new Error("Archive exceeds the 10 MB portability limit.");
  return raw;
}
/** Prefix-only merging preserves all current versions; forks are explicit conflicts, never overwritten. */
export async function mergeArchives(currentValue: PolicyArchive, incomingValue: PolicyArchive): Promise<PolicyArchive> {
  const current = await verifyArchive(currentValue), incoming = await verifyArchive(incomingValue);
  const shorter = current.releases.length < incoming.releases.length ? current.releases : incoming.releases;
  const longer = current.releases.length < incoming.releases.length ? incoming.releases : current.releases;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i].id !== longer[i].id || shorter[i].hash !== longer[i].hash) throw new Error("Conflicting release history or different factory. Current history was not replaced.");
  }
  const runs = new Map(current.runs.map(run => [run.id, run]));
  for (const run of incoming.runs) {
    if (runs.has(run.id) && runs.get(run.id)!.hash !== run.hash) throw new Error("Conflicting pinned calculation; current result was not overwritten.");
    runs.set(run.id, run);
  }
  return verifyArchive({ ...emptyArchive(), releases: longer, runs: [...runs.values()] });
}
