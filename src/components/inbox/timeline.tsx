"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Check, CheckCheck, Lock } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/lib/types";
import type { NoteWithAuthor } from "@/lib/data/notes";

type Item =
  | { kind: "message"; at: string; data: Message }
  | { kind: "note"; at: string; data: NoteWithAuthor };

export function Timeline({
  messages,
  notes,
  memberNames,
}: {
  messages: Message[];
  notes: NoteWithAuthor[];
  memberNames: Record<string, string>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.created_at, data: m })),
    ...notes.map((n) => ({ kind: "note" as const, at: n.created_at, data: n })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50 px-6 py-4">
      {items.map((item) =>
        item.kind === "message" ? (
          <MessageBubble key={`m-${item.data.id}`} m={item.data} />
        ) : (
          <NoteCard
            key={`n-${item.data.id}`}
            note={item.data}
            memberNames={memberNames}
          />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const outbound = m.direction === "outbound";
  const fromBot = outbound && m.sent_by_bot;
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outbound
            ? fromBot
              ? "rounded-br-sm bg-violet-600 text-white"
              : "rounded-br-sm bg-brand-600 text-white"
            : "rounded-bl-sm bg-white text-slate-800",
        )}
      >
        {m.media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.media_url}
            alt={m.body ?? "Image"}
            className="mb-1 max-h-64 w-full rounded-lg object-contain"
          />
        )}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <p
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-right text-[10px]",
            outbound
              ? fromBot
                ? "text-violet-200"
                : "text-brand-100"
              : "text-slate-400",
          )}
          suppressHydrationWarning
        >
          {fromBot ? "🤖 AI · " : ""}
          {formatTime(m.created_at)}
          {outbound && <Ticks status={m.status} />}
        </p>
      </div>
    </div>
  );
}

/**
 * WhatsApp-style delivery ticks: ✓ sent, ✓✓ delivered, blue ✓✓ read.
 * Failed shows a red alert. Bubbles are colored, so "blue" reads as a bright
 * cyan that pops on both the brand-blue and violet (bot) backgrounds.
 */
function Ticks({ status }: { status: string | null }) {
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5 text-red-300" aria-label="failed" />;
  }
  if (status === "read") {
    return <CheckCheck className="h-3.5 w-3.5 text-cyan-300" aria-label="read" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-3.5 w-3.5 opacity-80" aria-label="delivered" />;
  }
  if (status === "sent" || status === "pending") {
    return <Check className="h-3.5 w-3.5 opacity-80" aria-label="sent" />;
  }
  return null;
}

function NoteCard({
  note,
  memberNames,
}: {
  note: NoteWithAuthor;
  memberNames: Record<string, string>;
}) {
  return (
    <div className="flex justify-center">
      <div className="max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
          <Lock className="h-3 w-3" />
          Internal note · {note.author?.full_name ?? "Someone"}
        </div>
        <p className="whitespace-pre-wrap break-words">{note.body}</p>
        {note.mentions.length > 0 && (
          <p className="mt-1 text-[11px] text-amber-600">
            Notifying:{" "}
            {note.mentions
              .map((id) => memberNames[id] ?? "Unknown")
              .join(", ")}
          </p>
        )}
        <p className="mt-1 text-right text-[10px] text-amber-500" suppressHydrationWarning>
          {formatTime(note.created_at)}
        </p>
      </div>
    </div>
  );
}
