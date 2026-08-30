import { importMasterExcel, importMasterJson, MAX_MASTER_BYTES } from "@/core/financial/portability";

self.addEventListener("message", (event: MessageEvent<{ requestId: string; buffer: ArrayBuffer; fileName: string; mimeType: string }>) => {
  const { requestId, buffer, fileName, mimeType } = event.data;
  try {
    if (buffer.byteLength > MAX_MASTER_BYTES) throw new Error("Financial master must be under 10 MB.");
    if (fileName.toLowerCase().endsWith(".json") && !["", "application/json", "text/json", "text/plain", "application/octet-stream"].includes(mimeType)) throw new Error("JSON filename and MIME type do not match.");
    const result = fileName.toLowerCase().endsWith(".json")
      ? { master: importMasterJson(new TextDecoder().decode(buffer)), warnings: [] }
      : importMasterExcel(buffer, fileName, mimeType);
    self.postMessage({ requestId, result });
  } catch (error) {
    self.postMessage({ requestId, error: error instanceof Error ? error.message : "Financial-master import failed. Your current draft is unchanged." });
  }
});
