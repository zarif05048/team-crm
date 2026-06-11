import { getConversations } from "@/lib/data/conversations";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { RealtimeRefresh } from "@/components/inbox/realtime-refresh";

export default async function PipelinePage() {
  const conversations = await getConversations();

  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresh />
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">Lead pipeline</h1>
        <span className="text-xs text-slate-400">
          Drag a card between columns to change its stage
        </span>
      </header>
      <PipelineBoard conversations={conversations} />
    </div>
  );
}
