import { getWeightLossStats, type Bucket } from "@/lib/data/analytics";

export const dynamic = "force-dynamic";

const LINE_DOT: Record<string, string> = {
  Dungun: "bg-emerald-500",
  Paka: "bg-sky-500",
  Marketing: "bg-violet-500",
};

function SummaryCard({ bucket, lines }: { bucket: Bucket; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {bucket.label}
      </p>
      <p className="mt-1 text-4xl font-semibold tabular-nums text-slate-900">{bucket.total}</p>
      <p className="text-xs text-slate-400">
        {bucket.total === 1 ? "patient asked" : "patients asked"}
      </p>
      <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
        {lines.map((line) => (
          <div key={line} className="flex items-center justify-between text-sm">
            <dt className="flex items-center gap-2 text-slate-500">
              <span className={`h-2 w-2 rounded-full ${LINE_DOT[line] ?? "bg-slate-400"}`} />
              {line}
            </dt>
            <dd className="font-medium tabular-nums text-slate-700">{bucket.byLine[line] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PeriodTable({
  title,
  hint,
  buckets,
  lines,
}: {
  title: string;
  hint: string;
  buckets: Bucket[];
  lines: string[];
}) {
  // Bar widths are relative to the busiest row in THIS table, so a quiet month
  // still shows shape instead of a row of slivers.
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-400">{hint}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Period</th>
              {lines.map((line) => (
                <th key={line} className="px-3 py-2 text-right font-medium">{line}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="w-32 px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {buckets.map((b) => (
              <tr key={b.key} className={b.total === 0 ? "text-slate-400" : "text-slate-700"}>
                <td className="whitespace-nowrap px-5 py-2">{b.label}</td>
                {lines.map((line) => (
                  <td key={line} className="px-3 py-2 text-right tabular-nums">
                    {b.byLine[line] ?? 0}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                  {b.total}
                </td>
                <td className="px-5 py-2">
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: `${(b.total / peak) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AnalyticsPage() {
  const stats = await getWeightLossStats();
  // Always show the two branches even before either has an enquiry, so the
  // table shape doesn't change under staff as data arrives.
  const lines = [...new Set(["Dungun", "Paka", ...stats.lines])];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">Weight-loss enquiries</h1>
        <span className="hidden text-xs text-slate-400 sm:block">
          Counted from the messages themselves, in clinic time
        </span>
      </header>

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard bucket={{ ...stats.today, label: "Today" }} lines={lines} />
          <SummaryCard bucket={{ ...stats.thisWeek, label: "This week" }} lines={lines} />
          <SummaryCard bucket={{ ...stats.thisMonth, label: "This month" }} lines={lines} />
        </div>

        <PeriodTable title="Daily" hint="last 14 days" buckets={stats.daily} lines={lines} />
        <PeriodTable title="Weekly" hint="last 8 weeks, Monday to Sunday" buckets={stats.weekly} lines={lines} />
        <PeriodTable title="Monthly" hint="last 6 months" buckets={stats.monthly} lines={lines} />

        <p className="pb-2 text-xs leading-relaxed text-slate-400">
          Each figure counts <strong>distinct patients</strong>, not messages — asking five
          times in one day counts once. A patient who asks on two different lines counts once in
          the total but appears under both lines, so the line columns can add up to more than the
          total. A patient is counted as a weight-loss enquiry when one of their messages mentions
          Mounjaro, Wegovy, Ozempic, semaglutide, tirzepatide, kurus, turun berat, berat badan,
          langsing, slim or diet — the same rule the WhatsApp bots use for the 9pm report.
          {" "}Matched {stats.scanned} message{stats.scanned === 1 ? "" : "s"} in the last 6 months.
        </p>
      </div>
    </div>
  );
}
