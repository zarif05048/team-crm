import { getWeightLossStats, type Bucket } from "@/lib/data/analytics";
import { PeriodChart } from "@/components/analytics/period-chart";

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

        <PeriodChart title="Daily" hint="last 14 days" buckets={stats.daily} lines={lines} />
        <PeriodChart title="Weekly" hint="last 8 weeks, Mon-Sun" buckets={stats.weekly} lines={lines} />
        <PeriodChart title="Monthly" hint="last 6 months" buckets={stats.monthly} lines={lines} />

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
