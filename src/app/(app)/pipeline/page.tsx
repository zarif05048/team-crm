import Link from "next/link";
import { getPipeline, isPipelineKey, PIPELINES, type PipelineKey } from "@/lib/data/conversations";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { RealtimeRefresh } from "@/components/inbox/realtime-refresh";
import { malaysiaDate } from "@/lib/pipeline-follow-up";
import { moveUnansweredFollowUps } from "@/lib/pipeline-no-response";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Always rendered per request: it reads the signed-in user's cookies and
// moves cards, so there is nothing to pre-build.
export const dynamic = "force-dynamic";

/* Two boards on the same stages (owner, 2026-11-09: "focus on weight loss,
   minor surgery"): /pipeline is weight loss, /pipeline?p=minor-surgery the
   procedures on the TCA list. */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const key: PipelineKey = isPipelineKey(p) ? p : "weight-loss";
  const today = malaysiaDate(new Date().toISOString());
  // Outside the try below: reading cookies is how Next knows this page is
  // dynamic, and that signal must not be swallowed.
  const supabase = await createClient();
  // Follow Up cards unanswered for 7 days go to Not Respond before the board
  // is drawn (owner, 2026-10-10). A failure here must not hide the board.
  try {
    const res = await moveUnansweredFollowUps(supabase, today, PIPELINES[key].tag);
    if (res.error) console.error("[pipeline] Not Respond sweep:", res.error);
  } catch (e) {
    console.error("[pipeline] Not Respond sweep:", e);
  }
  const conversations = await getPipeline(key);

  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresh includeContacts />
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-surface px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-semibold text-slate-900">{PIPELINES[key].title}</h1>
          <nav className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-medium" aria-label="Pipeline">
            {(Object.keys(PIPELINES) as PipelineKey[]).map((k) => (
              <Link
                key={k}
                href={k === "weight-loss" ? "/pipeline" : `/pipeline?p=${k}`}
                aria-current={k === key ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  k === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {PIPELINES[k].label}
              </Link>
            ))}
          </nav>
        </div>
        <span className="hidden max-w-md text-right text-xs text-slate-500 lg:block">
          No reply 7 days after a follow-up → moves to Not Respond by itself · Yellow = Booking 7+ days after its date
        </span>
      </header>
      <PipelineBoard key={key} conversations={conversations} today={today} pipeline={key} />
    </div>
  );
}
