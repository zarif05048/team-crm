"use client";

import { useState, useTransition, useMemo } from "react";
import { Send, Lock, MessageSquare, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sendReply,
  sendTemplateReply,
  addNote,
} from "@/app/(app)/inbox/[id]/actions";

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
}

type Mode = "reply" | "note";

export function Composer({
  conversationId,
  windowOpen,
  members,
}: {
  conversationId: string;
  windowOpen: boolean;
  members: Member[];
}) {
  const [mode, setMode] = useState<Mode>("reply");
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Detect a trailing "@query" to drive the mention autocomplete (note mode).
  const mentionQuery = useMemo(() => {
    if (mode !== "note") return null;
    const m = text.match(/@(\w*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [text, mode]);

  const mentionMatches =
    mentionQuery !== null
      ? members
          .filter((u) =>
            (u.full_name ?? u.email ?? "").toLowerCase().includes(mentionQuery),
          )
          .slice(0, 5)
      : [];

  const pickMention = (u: Member) => {
    const name = (u.full_name ?? u.email ?? "").replace(/\s+/g, "");
    setText((t) => t.replace(/@(\w*)$/, `@${name} `));
    setMentions((ms) => (ms.includes(u.id) ? ms : [...ms, u.id]));
  };

  const submit = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const res =
        mode === "reply"
          ? await sendReply(conversationId, body)
          : await addNote(conversationId, body, mentions);
      if (res.ok) {
        setText("");
        setMentions([]);
      } else {
        setError(res.error ?? "Failed.");
      }
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
    if (e.key === "Enter" && !e.shiftKey && mentionMatches.length === 0) {
      e.preventDefault();
      submit();
    }
  };

  const isNote = mode === "note";

  return (
    <footer className="border-t border-slate-200 bg-white p-3">
      {/* Mode tabs */}
      <div className="mb-2 flex gap-1">
        <TabButton
          active={mode === "reply"}
          onClick={() => setMode("reply")}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Reply"
          tone="emerald"
        />
        <TabButton
          active={mode === "note"}
          onClick={() => setMode("note")}
          icon={<StickyNote className="h-3.5 w-3.5" />}
          label="Internal note"
          tone="amber"
        />
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Reply mode, window closed → template path */}
      {mode === "reply" && !windowOpen ? (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4" />
            24-hour reply window closed
          </div>
          <p className="text-xs text-amber-700">
            WhatsApp only allows free messages within 24h of the customer&apos;s
            last message. Send an approved template to re-open the chat — or
            switch to an Internal note for your team.
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
      ) : (
        <div className="relative">
          {/* Mention autocomplete */}
          {mentionMatches.length > 0 && (
            <ul className="absolute bottom-full mb-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {mentionMatches.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => pickMention(u)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  >
                    {u.full_name ?? u.email}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                isNote
                  ? "Write an internal note… type @ to mention a teammate"
                  : "Type a reply… (Enter to send, Shift+Enter for new line)"
              }
              className={cn(
                "max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                isNote
                  ? "border-amber-300 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500/30"
                  : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/30",
              )}
            />
            <Button
              onClick={submit}
              disabled={pending || !text.trim()}
              variant={isNote ? "secondary" : "primary"}
              className={cn(
                "h-10",
                isNote && "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200",
              )}
            >
              {isNote ? <StickyNote className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {pending ? "…" : isNote ? "Add note" : "Send"}
            </Button>
          </div>
          {isNote && (
            <p className="mt-1 text-[11px] text-amber-600">
              🔒 Internal — your team sees this, the customer never does.
            </p>
          )}
        </div>
      )}
    </footer>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "emerald" | "amber";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "emerald"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700"
          : "text-slate-500 hover:bg-slate-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
