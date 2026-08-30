import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialSetupWizard } from "./financial-setup-wizard";
import { AnalysisWorkspace } from "@/features/workflow/analysis-workspace";
import { DraftControls } from "./draft-controls";
import { emptyMaster } from "@/core/financial/schema";
import { DRAFT_KEY } from "@/core/financial/draft-storage";
import { MmsImporter } from "@/features/importer/mms-importer";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem(DRAFT_KEY); });

describe("guided financial setup", () => {
  it("shows a single primary workflow step and preserves state across navigation", () => {
    render(<AnalysisWorkspace />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start with your MMS workbook");
    fireEvent.click(screen.getByRole("button", { name: "2 · Financial setup" }));
    fireEvent.change(screen.getByLabelText("Factory name"), { target: { value: "QA Factory" } });
    fireEvent.click(screen.getByRole("button", { name: "1 · Import data" }));
    fireEvent.click(screen.getByRole("button", { name: "2 · Financial setup" }));
    expect(screen.getByLabelText("Factory name")).toHaveValue("QA Factory");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Set up your financial inputs");
  });
  it("retains native calendar input and seeds new entry effective dates", () => {
    render(<FinancialSetupWizard source={null} />);
    fireEvent.input(screen.getByLabelText("Analysis from"), { target: { value: "2026-01-01" } });
    fireEvent.input(screen.getByLabelText("Analysis through"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: /02\s*Products/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add entry" }));
    expect(screen.getByLabelText("Effective from *")).toHaveValue("2026-01-01");
    fireEvent.click(screen.getByRole("button", { name: /01\s*Factory & dates/ }));
    expect(screen.getByLabelText("Analysis through")).toHaveValue("2026-01-31");
  });
  it("distinguishes missing, zero and invalid financial inputs inline", () => {
    render(<FinancialSetupWizard source={null} />);
    fireEvent.click(screen.getByRole("button", { name: /02\s*Products/ })); fireEvent.click(screen.getByRole("button", { name: "+ Add entry" }));
    const material = screen.getByLabelText("Material cost (₹/unit) *");
    expect(material).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(material, { target: { value: "0" } });
    expect(material).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Explicit zero — verify this is correct.")).toBeInTheDocument();
    fireEvent.change(material, { target: { value: "-2" } });
    expect(material).toHaveAttribute("aria-invalid", "true");
  });
  it("returns confirmed entries to draft after a rate edit", () => {
    render(<FinancialSetupWizard source={null} />);
    fireEvent.click(screen.getByRole("button", { name: /02\s*Products/ })); fireEvent.click(screen.getByRole("button", { name: "+ Add entry" }));
    fireEvent.change(screen.getByLabelText("Evidence status *"), { target: { value: "confirmed" } });
    fireEvent.change(screen.getByLabelText("Selling price (₹/unit) *"), { target: { value: "100" } });
    expect(screen.getByLabelText("Evidence status *")).toHaveValue("draft");
  });
  it("keeps incomplete drafts editable and review does not invent profit", () => {
    render(<FinancialSetupWizard source={null} />);
    fireEvent.click(screen.getByRole("button", { name: /10\s*Review setup/ }));
    expect(screen.getByText(/Draft retained with incomplete setup/)).toBeInTheDocument();
    expect(screen.getByText(/does not calculate profit/)).toBeInTheDocument();
  });
  it("creates a new effective-period draft without editing the existing row", () => {
    render(<FinancialSetupWizard source={null} />);
    fireEvent.click(screen.getByRole("button", { name: /02\s*Products/ })); fireEvent.click(screen.getByRole("button", { name: "+ Add entry" }));
    fireEvent.change(screen.getByLabelText("Product ID *"), { target: { value: "P-1" } });
    fireEvent.input(screen.getByLabelText("Effective from *"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy to new effective period" }));
    expect(screen.getByLabelText("Product ID *")).toHaveValue("P-1");
    expect(screen.getByLabelText("Effective from *")).toHaveValue("");
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });
});

describe("local consent UI", () => {
  it("does not write until consent, saves, then deletes only its own draft", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<DraftControls master={emptyMaster()} onRestore={vi.fn()} />);
    fireEvent.click(screen.getByText("Privacy & local draft"));
    expect(setItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(setItem).toHaveBeenCalled());
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete saved draft & stop saving" }));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("keeps the draft in memory if consent saving fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<DraftControls master={emptyMaster()} onRestore={vi.fn()} />);
    fireEvent.click(screen.getByText("Privacy & local draft")); fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText(/Could not enable local saving/)).toBeInTheDocument();
  });
});

describe("MMS import regression", () => {
  it("does not create a worker after cancelling an in-flight file read", async () => {
    const worker = vi.fn(); vi.stubGlobal("Worker", worker);
    let resolve: (value: ArrayBuffer) => void = () => {};
    const pending = new Promise<ArrayBuffer>(done => { resolve = done; });
    const file = new File(["synthetic"], "sample.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: () => pending });
    render(<MmsImporter />);
    fireEvent.change(screen.getByLabelText("Choose workbook"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await act(async () => { resolve(new ArrayBuffer(8)); await pending; });
    expect(worker).not.toHaveBeenCalled();
    expect(screen.getByText(/Import cancelled/)).toBeInTheDocument();
  });
});
