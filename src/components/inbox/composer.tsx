"use client";

import { useState, useTransition } from "react";
import { Send, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendReply, sendTemplateReply } from "@/app/(app)/inbox/[id]/actions";

export function Composer({
  conversationId,
  windowOpen,
}: {
  conversationId: string;
  windowOpen: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submitReply = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const res = await sendReply(conversationId, body);
      if (res.ok) setText("");
      else setError(res.error ?? "Failed to send.");
    });
  };

  const sendReengagement = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await sendTemplateReply(conversationId, "hello_world");
      if (!res.ok) setError(res.error ?? "Failed to send template.");
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitReply();
    }
  };

  return (
    <footer className="border-t border-slate-200 bg-white p-3">
      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {windowOpen ? (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <Button
            onClick={submitReply}
            disabled={pending || !text.trim()}
            className="h-10"
          >
            <Send className="h-4 w-4" />
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4" />
            24-hour reply window closed
          </div>
          <p className="text-xs text-amber-700">
            WhatsApp only allows free messages within 24h of the customer&apos;s
            last message. To re-open the chat, send an approved template.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={sendReengagement}
            disabled={pending}
            className="self-start"
          >
            {pending ? "Sending…" : "Send re-engagement template"}
          </Button>
        </div>
      )}
    </footer>
  );
}
