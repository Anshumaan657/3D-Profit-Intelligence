import { MmsImporter } from "@/features/importer/mms-importer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-5 print:hidden">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-black tracking-tight text-white shadow-[0_8px_24px_rgba(13,148,136,0.24)]">
              3D
            </span>
            <div>
              <p className="text-sm font-bold tracking-[-0.01em]">
                3D Profit Intelligence
              </p>
              <p className="text-xs text-[var(--muted)]">
                Factory Profit, Loss and Forecast Dashboard
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] sm:flex">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            Phase 2 · Workbook importer
          </span>
        </header>

        <section className="grid gap-10 py-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:gap-14 lg:py-16">
          <div className="lg:sticky lg:top-10 print:hidden">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand)]">
              Evidence before analytics
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-bold leading-[1.02] tracking-[-0.052em] sm:text-5xl lg:text-6xl">
              Start with a workbook you can trust.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--muted)]">
              The importer checks the MMS structure, keeps every record tied to
              its source row, and highlights what needs review before any profit
              calculation begins.
            </p>

            <div className="mt-9 space-y-3">
              {[
                ["01", "Verifies sheets, headers and saved formula values"],
                ["02", "Normalizes production and downtime records locally"],
                ["03", "Retains questionable rows as evidence, outside totals"],
              ].map(([number, copy]) => (
                <div
                  key={number}
                  className="flex items-start gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-500/10 text-xs font-black text-[var(--brand)]">
                    {number}
                  </span>
                  <p className="pt-1 text-sm font-semibold leading-6">{copy}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-[var(--panel)] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">
                Calculation boundary
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Reported Qty is authoritative. Stroke × multiplier is used only
                as a validation signal, never as a silent replacement.
              </p>
            </div>
          </div>

          <MmsImporter />
        </section>

        <footer className="flex flex-col gap-2 border-t border-[var(--line)] py-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between print:hidden">
          <p>Phase 2 turns MMS workbooks into traceable canonical evidence.</p>
          <p>Original preserved · Local processing · Explicit exceptions</p>
        </footer>
      </div>
    </main>
  );
}
