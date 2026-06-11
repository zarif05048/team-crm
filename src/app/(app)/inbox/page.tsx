import { MessageSquare } from "lucide-react";

export default function InboxIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
        <MessageSquare className="h-7 w-7" />
      </div>
      <p className="font-medium text-slate-600">Select a conversation</p>
      <p className="mt-1 max-w-xs text-sm text-slate-400">
        Choose a chat on the left to view the conversation and reply.
      </p>
    </div>
  );
}
