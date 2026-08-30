import { ARCHIVE_MAX_BYTES, importArchive } from "../core/policy/portability";
self.onmessage = async (event: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id, buffer } = event.data;
  try {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > ARCHIVE_MAX_BYTES) throw new Error("Policy archive must be at most 10 MB.");
    const archive = await importArchive(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    self.postMessage({ id, status: "ready", archive });
  } catch (error) {
    self.postMessage({ id, status: "error", message: error instanceof Error ? error.message : "Invalid policy archive." });
  }
};
