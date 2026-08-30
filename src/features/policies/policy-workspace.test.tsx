import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { emptyMaster } from "@/core/financial/schema";
import type { FinancialRelease } from "@/core/policy/releases";
import { PolicyWorkspace } from "./policy-workspace";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Harness() {
  const [master] = useState(() => { const value = emptyMaster(); value.factory = "Synthetic QA"; value.scope = { from: "2026-01-01", to: "2026-12-31" }; return value; });
  const [history, setHistory] = useState<readonly FinancialRelease[]>([]);
  return <PolicyWorkspace master={master} history={history} onHistory={setHistory} />;
}
function fill() {
  fireEvent.input(screen.getByLabelText("Policy effective from"), { target: { value: "2026-01-01" } });
  for (const [label, value] of [["Assumption confidence cap", "60"], ["High confidence starts at", "85"], ["Medium confidence starts at", "65"], ["Low confidence starts at", "40"], ["Recorded by", "Synthetic reviewer"], ["Change / approval reason", "Test evidence only"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
it("starts with no invented policies or thresholds", () => {
  render(<Harness />); expect(screen.getByText(/No policies published/)).toBeInTheDocument(); expect(screen.getByLabelText("Assumption confidence cap")).toHaveValue("");
});
it("publishes a provisional release and records approval in a distinct release", async () => {
  render(<Harness />); fill(); fireEvent.click(screen.getByRole("button", { name: "Save provisional release" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Release 1 captured"));
  fireEvent.click(screen.getByText("Approval evidence"));
  fireEvent.change(screen.getByLabelText("Written approval reference"), { target: { value: "test://written-approval" } });
  fireEvent.click(screen.getByRole("button", { name: "Record self-declared approval in new release" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Release 2 captured"));
  fireEvent.click(screen.getByText("Release history"));
  fireEvent.change(screen.getByLabelText("Review release"), { target: { value: "1" } });
  expect(screen.getByText(/Good Production Quantity: provisional/)).toBeInTheDocument();
});
it("does not enable approval of unsaved edits", async () => {
  render(<Harness />); fill(); fireEvent.click(screen.getByRole("button", { name: "Save provisional release" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Release 1 captured"));
  fireEvent.change(screen.getByLabelText("Assumption confidence cap"), { target: { value: "50" } });
  fireEvent.click(screen.getByText("Approval evidence"));
  expect(screen.getByRole("button", { name: "Record self-declared approval in new release" })).toBeDisabled();
});
it("rejects blank thresholds instead of silently using zero", async () => {
  render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Save provisional release" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("explicit whole-number"));
  expect(screen.getByText(/No policies published/)).toBeInTheDocument();
});
