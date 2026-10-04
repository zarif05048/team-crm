import { getWeightLossPipeline } from "@/lib/data/conversations";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { RealtimeRefresh } from "@/components/inbox/realtime-refresh";
import { malaysiaDate } from "@/lib/pipeline-follow-up";

export default async function PipelinePage() {
  const conversations = await getWeightLossPipeline();

  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresh includeContacts />
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">
          Weight-loss pipeline
        </h1>
        <span className="max-w-sm text-right text-xs text-slate-500">
          Yellow = 7+ days without a reply in Qualified, or after the date set in Booking
        </span>
      </header>
      <PipelineBoard conversations={conversations} today={malaysiaDate(new Date().toISOString())} />
    </div>
  );
}
