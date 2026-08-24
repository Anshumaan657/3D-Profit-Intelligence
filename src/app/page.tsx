export default function Home() {
  const principles = [
    {
      number: "01",
      title: "Financially honest",
      description:
        "Actual results, operational estimates and opportunity losses will always remain separate.",
    },
    {
      number: "02",
      title: "Evidence first",
      description:
        "Every future amount will trace back to its workbook record, input and policy version.",
    },
    {
      number: "03",
      title: "Private by default",
      description:
        "Factory workbooks are designed to be processed locally and never committed to source control.",
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
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
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Phase 1 · Review checkpoint
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand)]">
              Operational financial performance
            </p>
            <h1 className="max-w-4xl text-5xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Turn factory activity into financial clarity.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              A local-first workspace designed to explain where profit is made,
              where money is lost and which improvement deserves attention
              first—without presenting estimates as audited accounts.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {principles.map((principle) => (
                <article
                  key={principle.number}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
                >
                  <p className="text-xs font-bold tracking-[0.18em] text-[var(--brand)]">
                    {principle.number}
                  </p>
                  <h2 className="mt-5 text-sm font-bold">{principle.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {principle.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[2rem] bg-[var(--panel)] p-7 text-white shadow-[0_28px_80px_rgba(9,30,46,0.22)] sm:p-9">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border-[32px] border-white/[0.04]" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">
              Foundation status
            </p>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em]">
              Built for trustworthy numbers from the first record.
            </h2>
            <div className="mt-9 space-y-4">
              {[
                "Independent calculation-engine architecture",
                "Versioned and provisional financial-policy model",
                "Secure workbook handling boundaries",
                "Automated quality gates for every future phase",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 border-b border-white/10 pb-4 last:border-0 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-400/15 text-xs font-bold text-teal-300"
                  >
                    ✓
                  </span>
                  <p className="text-sm leading-6 text-slate-200">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Privacy boundary
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                No client workbook is bundled, uploaded, or stored by this
                foundation.
              </p>
            </div>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[var(--line)] py-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Phase 1 establishes the secure, testable project foundation.</p>
          <p>Estimated results · Traceable evidence · Explicit confidence</p>
        </footer>
      </div>
    </main>
  );
}
