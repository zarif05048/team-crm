import { getWeightLossPipeline } from "@/lib/data/conversations";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { RealtimeRefresh } from "@/components/inbox/realtime-refresh";
import { malaysiaDate } from "@/lib/pipeline-follow-up";
import { moveUnansweredFollowUps } from "@/lib/pipeline-no-response";
import { createClient } from "@/lib/supabase/server";

// Always rendered per request: it reads the signed-in user's cookies and
// moves cards, so there is nothing to pre-build.
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const today = malaysiaDate(new Date().toISOString());
  // Outside the try below: reading cookies is how Next knows this page is
  // dynamic, and that signal must not be swallowed.
  const supabase = await createClient();
  // Follow Up cards unanswered for 7 days go to Not Respond before the board
  // is drawn (owner, 2026-10-10). A failure here must not hide the board.
  try {
    const res = await moveUnansweredFollowUps(supabase, today);
    if (res.error) console.error("[pipeline] Not Respond sweep:", res.error);
  } catch (e) {
    console.error("[pipeline] Not Respond sweep:", e);
  }
  const conversations = await getWeightLossPipeline();

  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresh includeContacts />
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">
          Weight-loss pipeline
        </h1>
        <span className="max-w-md text-right text-xs text-slate-500">
          No reply 7 days after a follow-up → moves to Not Respond by itself · Yellow = Booking 7+ days after its date
        </span>
      </header>
      <PipelineBoard conversations={conversations} today={today} />
    </div>
  );
}
