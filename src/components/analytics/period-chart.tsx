import type { Bucket } from "@/lib/data/analytics";

/**
 * Stacked columns: one column per period, segmented by clinic line.
 *
 * The job is two things at once — the trend over time, and how the branches
 * split it — which is what a stacked column does and a table does not. The
 * numbers stay reachable underneath, because these fills sit below 3:1 against
 * white and colour alone must never be the only way to read a value.
 *
 * Plain SVG, rendered on the server: no chart library, no client JS, and
 * therefore nothing here that can produce a hydration mismatch. Hover text
 * comes from <title>, which browsers show natively.
 */

/* Fixed hue per line — never cycled, and matched to the LineBadge colours so a
   branch is the same colour wherever staff see it. Validated as a categorical
   set (lightness band, chroma floor, CVD separation, normal-vision floor);
   the amber slot replaces a slate gray that failed the chroma floor. */
const SERIES_COLOR: Record<string, string> = {
  Dungun: "#10b981",
  Paka: "#0ea5e9",
  Marketing: "#8b5cf6",
};
const OTHER_COLOR = "#f59e0b";
const colorFor = (line: string) => SERIES_COLOR[line] ?? OTHER_COLOR;

const W = 720;
const H = 200;
const PAD = { top: 18, right: 8, bottom: 26, left: 28 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MAX_BAR = 24;   // never fill the slot — the leftover band is air
const GAP = 2;        // surface-coloured gap between stacked segments
const RADIUS = 4;     // rounded data-end, square at the baseline

/** A tick scale that lands on whole patients — a count of people is never 2.5. */
function niceTicks(max: number): { top: number; ticks: number[] } {
  if (max <= 4) {
    const top = Math.max(1, max);
    return { top, ticks: Array.from({ length: top + 1 }, (_, i) => i) };
  }
  const step = Math.ceil(max / 4);
  const top = step * 4;
  return { top, ticks: [0, step * 2, top] };
}

/** Column with a rounded cap and a square base, as one path. */
function capPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

export function PeriodChart({
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
  // Oldest on the left: time reads left-to-right even though the data arrives newest-first.
  const data = [...buckets].reverse();
  const max = Math.max(...data.map((b) => b.total), 0);
  const { top, ticks } = niceTicks(max);
  const band = PLOT_W / Math.max(1, data.length);
  const barW = Math.min(MAX_BAR, band - 8);
  const yOf = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  // Every other label on the 14-day chart; all of them when there is room.
  const labelEvery = data.length > 10 ? 2 : 1;
  const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center gap-3">
          {/* Legend — always present for two or more series, so identity never
              depends on telling two fills apart. */}
          {lines.map((line) => (
            <span key={line} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(line) }} />
              {line}
            </span>
          ))}
          <span className="text-xs text-slate-400">{hint}</span>
        </div>
      </header>

      <div className="px-3 pb-1 pt-3">
        {max === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-slate-400">
            No weight-loss enquiries in this period.
          </p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
               aria-label={`${title}: weight-loss enquiries per period, split by clinic line`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)}
                      stroke="#e2e8f0" strokeWidth={1} />
                <text x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end"
                      className="fill-slate-400" style={{ fontSize: 10 }}>{t}</text>
              </g>
            ))}

            {data.map((b, i) => {
              const x = PAD.left + i * band + (band - barW) / 2;
              let cursor = 0; // stack upward from the baseline
              const segs = lines
                .map((line) => ({ line, value: b.byLine[line] ?? 0 }))
                .filter((s) => s.value > 0);
              return (
                <g key={b.key}>
                  {segs.map((s, idx) => {
                    const isTop = idx === segs.length - 1;
                    const yTop = yOf(cursor + s.value);
                    const raw = yOf(cursor) - yTop;
                    cursor += s.value;
                    // The gap is taken off the top of each lower segment, so the
                    // separation is surface colour rather than a drawn border.
                    const h = Math.max(1, raw - (isTop ? 0 : GAP));
                    const title = `${b.label} — ${s.line}: ${s.value} patient${s.value === 1 ? "" : "s"}`;
                    return isTop ? (
                      <path key={s.line} d={capPath(x, yTop, barW, h)} fill={colorFor(s.line)}>
                        <title>{title}</title>
                      </path>
                    ) : (
                      <rect key={s.line} x={x} y={yTop + GAP} width={barW} height={h}
                            fill={colorFor(s.line)}>
                        <title>{title}</title>
                      </rect>
                    );
                  })}
                  {/* Only the busiest column is labelled — a number on every one
                      is noise, and the table underneath carries them all. */}
                  {b.key === peak.key && b.total > 0 && (
                    <text x={x + barW / 2} y={yOf(b.total) - 5} textAnchor="middle"
                          className="fill-slate-500" style={{ fontSize: 10, fontWeight: 600 }}>
                      {b.total}
                    </text>
                  )}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle"
                          className="fill-slate-400" style={{ fontSize: 10 }}>
                      {b.label.replace(/^Week of /, "")}
                    </text>
                  )}
                </g>
              );
            })}

            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(0)} y2={yOf(0)}
                  stroke="#cbd5e1" strokeWidth={1} />
          </svg>
        )}
      </div>

      {/* The fills sit under 3:1 against white, so the exact numbers stay one
          click away rather than locked inside the colour. */}
      <details className="border-t border-slate-100 px-5 py-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Show numbers
        </summary>
        <div className="overflow-x-auto pb-2">
          <table className="mt-2 w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-4 font-medium">Period</th>
                {lines.map((l) => (
                  <th key={l} className="px-3 py-1 text-right font-medium">{l}</th>
                ))}
                <th className="px-3 py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buckets.map((b) => (
                <tr key={b.key} className={b.total === 0 ? "text-slate-400" : "text-slate-700"}>
                  <td className="whitespace-nowrap py-1 pr-4">{b.label}</td>
                  {lines.map((l) => (
                    <td key={l} className="px-3 py-1 text-right tabular-nums">{b.byLine[l] ?? 0}</td>
                  ))}
                  <td className="px-3 py-1 text-right font-semibold tabular-nums text-slate-900">
                    {b.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
