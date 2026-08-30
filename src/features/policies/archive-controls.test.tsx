import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyArchive } from "@/core/policy/portability";
import { POLICY_STORAGE_KEY } from "@/core/policy/local-archive";
import { ArchiveControls } from "./archive-controls";
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); localStorage.removeItem(POLICY_STORAGE_KEY); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem(POLICY_STORAGE_KEY); });
it("requires consent, saves, and deletes only its policy key", async () => {
  localStorage.setItem("unrelated-policy-test", "keep");
  const save = vi.spyOn(Storage.prototype, "setItem");
  render(<ArchiveControls archive={emptyArchive()} onMerge={vi.fn()} onRestoreMaster={vi.fn()} />);
  fireEvent.click(screen.getByText("Policy backup, restore & privacy")); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(localStorage.getItem(POLICY_STORAGE_KEY)).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Delete saved policy archive & stop saving" }));
  expect(localStorage.getItem(POLICY_STORAGE_KEY)).toBeNull(); expect(localStorage.getItem("unrelated-policy-test")).toBe("keep"); localStorage.removeItem("unrelated-policy-test");
});
it("reports storage failure and keeps consent disabled", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  render(<ArchiveControls archive={emptyArchive()} onMerge={vi.fn()} onRestoreMaster={vi.fn()} />);
  fireEvent.click(screen.getByText("Policy backup, restore & privacy")); fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Local saving failed")); expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("cancels a file read before worker creation", async () => {
  const worker = vi.fn(); vi.stubGlobal("Worker", worker); let finish: (buffer: ArrayBuffer) => void = () => {};
  const reading = new Promise<ArrayBuffer>(resolve => { finish = resolve; }); const file = new File(["{}"], "backup.json", { type: "application/json" }); Object.defineProperty(file, "arrayBuffer", { value: () => reading });
  render(<ArchiveControls archive={emptyArchive()} onMerge={vi.fn()} onRestoreMaster={vi.fn()} />); fireEvent.click(screen.getByText("Policy backup, restore & privacy"));
  fireEvent.change(screen.getByLabelText("Import policy archive"), { target: { files: [file] } }); fireEvent.click(screen.getByRole("button", { name: "Cancel archive import" }));
  await act(async () => { finish(new ArrayBuffer(1)); await reading; }); expect(worker).not.toHaveBeenCalled();
});
it("previews saved data without auto-restoring or enabling saving", async () => {
  localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify({ version: 1, consentAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), archive: emptyArchive() }));
  const merge = vi.fn().mockResolvedValue(undefined);
  render(<ArchiveControls archive={emptyArchive()} onMerge={merge} onRestoreMaster={vi.fn()} />); fireEvent.click(screen.getByText("Policy backup, restore & privacy"));
  fireEvent.click(screen.getByRole("button", { name: "Preview saved policy archive" })); await waitFor(() => expect(screen.getByText(/Archive preview/)).toBeInTheDocument());
  expect(merge).not.toHaveBeenCalled(); expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Merge verified history" })); await waitFor(() => expect(merge).toHaveBeenCalledTimes(1));
});
it("shows worker-validated import preview before applying changes", async () => {
  const terminate = vi.fn();
  class MockWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminate = terminate;
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { status: "ready", archive: emptyArchive() } })); }
  }
  vi.stubGlobal("Worker", MockWorker);
  const file = new File(["{}"], "backup.json", { type: "application/json" }); Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(2) });
  const merge = vi.fn(); render(<ArchiveControls archive={emptyArchive()} onMerge={merge} onRestoreMaster={vi.fn()} />); fireEvent.click(screen.getByText("Policy backup, restore & privacy"));
  fireEvent.change(screen.getByLabelText("Import policy archive"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/Archive preview/)).toBeInTheDocument()); expect(merge).not.toHaveBeenCalled(); expect(terminate).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep current history" })); expect(merge).not.toHaveBeenCalled();
});
