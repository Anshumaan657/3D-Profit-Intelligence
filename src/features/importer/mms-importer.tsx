"use client";

import { useEffect, useRef, useState } from "react";

import type {
  MmsImportSummary,
  MmsImportWorkerRequest,
  MmsImportWorkerResponse,
} from "@/core/mms";

const MAXIMUM_FILE_BYTES = 50 * 1024 * 1024;

type ImportState =
  | { status: "idle" }
  | { status: "reading"; fileName: string; stage: string; progress: number }
  | { status: "parsing"; fileName: string; stage: string; progress: number }
  | { status: "success"; fileName: string; summary: MmsImportSummary }
  | {
      status: "failure";
      fileName: string;
      message: string;
      response?: Extract<MmsImportWorkerResponse, { type: "failure" }>;
    };

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function displayBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function displayDateRange(value: [string, string] | null): string {
  if (!value) return "Not available";
  return value[0] === value[1] ? value[0] : `${value[0]} — ${value[1]}`;
}

export function MmsImporter({ onReady, onContinue, onReset }: { onReady?: (summary: MmsImportSummary) => void; onContinue?: () => void; onReset?: () => void }) {
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      requestRef.current = null;
      workerRef.current?.terminate();
    },
    [],
  );

  function stopWorker(): void {
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current = null;
  }

  function reset(): void {
    stopWorker();
    onReset?.();
    if (inputRef.current) inputRef.current.value = "";
    setState({ status: "idle" });
  }

  function rejectFile(fileName: string, message: string): void {
    stopWorker();
    setState({ status: "failure", fileName, message });
  }

  async function importFile(file: File): Promise<void> {
    stopWorker();
    onReset?.();
    const id = requestId();
    requestRef.current = id;
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "xls" && extension !== "xlsx") {
      rejectFile(file.name, "Choose an unprotected .xls or .xlsx MMS workbook.");
      return;
    }
    if (file.size > MAXIMUM_FILE_BYTES) {
      rejectFile(
        file.name,
        `This workbook is ${displayBytes(file.size)}. The safe limit is 50 MB.`,
      );
      return;
    }

    setState({
      status: "reading",
      fileName: file.name,
      progress: 4,
      stage: "Reading the file locally",
    });

    try {
      const buffer = await file.arrayBuffer();
      if (requestRef.current !== id) return;
      const worker = new Worker(
        new URL("../../workers/mms-import.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.addEventListener(
        "message",
        (event: MessageEvent<MmsImportWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== requestRef.current) return;
          if (response.type === "progress") {
            setState({
              status: "parsing",
              fileName: file.name,
              progress: response.progress,
              stage: response.stage,
            });
            return;
          }
          if (response.type === "success") {
            onReady?.(response.summary);
            setState({
              status: "success",
              fileName: file.name,
              summary: response.summary,
            });
            return;
          }
          setState({
            status: "failure",
            fileName: file.name,
            message: response.message,
            response,
          });
          stopWorker();
        },
      );
      worker.addEventListener("error", () => {
        if (requestRef.current !== id) return;
        rejectFile(
          file.name,
          "The local import worker stopped unexpectedly. The source workbook was not changed.",
        );
      });
      const request: MmsImportWorkerRequest = {
        type: "parse",
        requestId: id,
        file: {
          name: file.name,
          mimeType: file.type,
          byteLength: file.size,
          lastModified: file.lastModified,
          buffer,
        },
      };
      worker.postMessage(request, [buffer]);
    } catch (error) {
      if (requestRef.current !== id) return;
      rejectFile(
        file.name,
        error instanceof Error
          ? error.message
          : "The selected file could not be read locally.",
      );
    }
  }

  function handleFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) void importFile(file);
  }

  function cancel(): void {
    const fileName = state.status === "idle" ? "" : state.fileName;
    stopWorker();
    setState({
      status: "failure",
      fileName,
      message: "Import cancelled. No workbook data was saved or uploaded.",
    });
  }

  function downloadReport(): void {
    if (state.status !== "success") return;
    const report = JSON.stringify(state.summary, null, 2);
    const url = URL.createObjectURL(
      new Blob([report], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.fileName.replace(/\.(xlsx?|XLSX?)$/, "")}-compatibility-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const busy = state.status === "reading" || state.status === "parsing";
  const report =
    state.status === "success"
      ? state.summary.compatibility
      : state.status === "failure"
        ? state.response?.compatibility
        : undefined;

  return (
    <section
      aria-labelledby="import-heading"
      className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.07)] sm:p-7 lg:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand)]">
            Local workbook importer
          </p>
          <h2
            id="import-heading"
            className="mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-3xl"
          >
            Bring your MMS evidence into focus.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Select the Product Log Book and Down Time Details workbook. It is
            checked and normalized inside this browser tab.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-[var(--brand)]">
          <span className="h-2 w-2 rounded-full bg-teal-500" />
          Local only
        </span>
      </div>

      {state.status === "idle" ? (
        <div
          className={`mt-7 grid min-h-56 cursor-pointer place-items-center rounded-3xl border-2 border-dashed p-7 text-center transition ${
            dragActive
              ? "border-[var(--brand)] bg-teal-500/10"
              : "border-[var(--line)] bg-[var(--canvas)] hover:border-[var(--brand)]"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            handleFiles(event.dataTransfer.files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--panel)] text-2xl text-white">
              ↑
            </span>
            <p className="mt-5 text-base font-bold">
              Drop an MMS workbook here
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              or choose a file · .xls and .xlsx · up to 50 MB
            </p>
            <label
              className="mt-5 inline-flex cursor-pointer rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(13,148,136,0.22)]"
              onClick={(event) => event.stopPropagation()}
            >
              Choose workbook
              <input
                ref={inputRef}
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => handleFiles(event.target.files)}
                type="file"
              />
            </label>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div aria-live="polite" className="mt-7 rounded-3xl bg-[var(--canvas)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{state.fileName}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{state.stage}</p>
            </div>
            <span className="text-sm font-black text-[var(--brand)]">
              {state.progress}%
            </span>
          </div>
          <div
            aria-label="Import progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={state.progress}
            className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--line)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--brand)] transition-[width]"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <button
            className="mt-5 text-sm font-bold text-[var(--muted)] underline underline-offset-4"
            onClick={cancel}
            type="button"
          >
            Cancel import
          </button>
        </div>
      ) : null}

      {state.status === "success" ? (
        <div aria-live="polite" className="mt-7">
          <div className="flex flex-col gap-4 rounded-3xl border border-teal-500/25 bg-teal-500/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
                {state.summary.compatibility.status === "compatible"
                  ? "Compatible"
                  : "Compatible with warnings"}
              </p>
              <p className="mt-1 text-lg font-bold">{state.fileName}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Source rows remain traceable to their original sheet and row.
              </p>
            </div>
            <button
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold"
              onClick={reset}
              type="button"
            >
              Import another
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Production records", state.summary.productionRecordCount.toLocaleString()],
              ["Downtime records", state.summary.downtimeRecordCount.toLocaleString()],
              ["Machines found", state.summary.machineCount.toLocaleString()],
              ["Products found", state.summary.productCount.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[var(--canvas)] p-4">
                <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em]">{value}</p>
              </div>
            ))}
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] p-4">
              <dt className="font-semibold text-[var(--muted)]">Date coverage</dt>
              <dd className="mt-1 font-bold">{displayDateRange(state.summary.dateRange)}</dd>
            </div>
            <div className="rounded-2xl border border-[var(--line)] p-4">
              <dt className="font-semibold text-[var(--muted)]">Data-quality findings</dt>
              <dd className="mt-1 font-bold">
                {state.summary.totalDataIssueCount.toLocaleString()} findings · {state.summary.stats.invalidRecordsExcluded.toLocaleString()} invalid rows excluded
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-3 print:hidden">
            {onContinue ? <button className="setup-button" onClick={onContinue} type="button">Continue to financial setup →</button> : null}
            <button
              className="rounded-xl bg-[var(--panel)] px-4 py-2.5 text-sm font-bold text-white"
              onClick={downloadReport}
              type="button"
            >
              Download JSON report
            </button>
            <button
              className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-bold"
              onClick={() => window.print()}
              type="button"
            >
              Print report
            </button>
          </div>
        </div>
      ) : null}

      {state.status === "failure" ? (
        <div aria-live="assertive" className="mt-7 rounded-3xl border border-rose-500/25 bg-rose-500/[0.07] p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">
            Import needs attention
          </p>
          <p className="mt-2 font-bold">{state.fileName || "Workbook import"}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{state.message}</p>
          {report?.issues.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {report.issues
                .filter((issue) => issue.severity !== "info")
                .slice(0, 6)
                .map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="flex gap-2">
                    <span aria-hidden="true">—</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          <button
            className="mt-5 rounded-xl bg-[var(--panel)] px-4 py-2.5 text-sm font-bold text-white"
            onClick={reset}
            type="button"
          >
            Choose another workbook
          </button>
        </div>
      ) : null}

      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
        <span aria-hidden="true">◆</span>
        Your original workbook is never modified. Formula cells use their saved
        values and are disclosed in the compatibility report.
      </p>
    </section>
  );
}
