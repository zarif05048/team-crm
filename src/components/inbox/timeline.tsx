"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertCircle, Check, CheckCheck, Lock } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { useThreadSearch } from "@/components/inbox/thread-search";
import type { Message } from "@/lib/types";
import type { NoteWithAuthor } from "@/lib/data/notes";

type Item =
  | { kind: "message"; at: string; data: Message }
  | { kind: "note"; at: string; data: NoteWithAuthor };

const itemKey = (item: Item) =>
  item.kind === "message" ? `m-${item.data.id}` : `n-${item.data.id}`;

/** Everything in-conversation search looks at for this item. */
const searchableText = (item: Item) =>
  item.kind === "message"
    ? (item.data.body ?? "")
    : `${item.data.body} ${item.data.author?.full_name ?? ""}`;

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
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const { open, query, activeKey, reportMatches } = useThreadSearch();

  const items = useMemo<Item[]>(
    () =>
      [
        ...messages.map((m) => ({
          kind: "message" as const,
          at: m.created_at,
          data: m,
        })),
        ...notes.map((n) => ({
          kind: "note" as const,
          at: n.created_at,
          data: n,
        })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [messages, notes],
  );

  // Matching happens here because this is where the thread's items live; the
  // search bar (in the header) gets the count and navigation from the context.
  const matchKeys = useMemo(
    () =>
      query
        ? items
            .filter((i) => searchableText(i).toLowerCase().includes(query))
            .map(itemKey)
        : [],
    [items, query],
  );

  useEffect(() => {
    reportMatches(matchKeys);
  }, [matchKeys, reportMatches]);

  // Jump to the selected match.
  useEffect(() => {
    if (!activeKey) return;
    itemRefs.current
      .get(activeKey)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeKey]);

  // New messages scroll to the bottom — but not while the user is reading a
  // search hit further up the thread.
  useEffect(() => {
    if (open) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, open]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-6">
      {items.map((item) => {
        const key = itemKey(item);
        return (
          <div
            key={key}
            ref={(el) => {
              itemRefs.current.set(key, el);
            }}
          >
            {item.kind === "message" ? (
              <MessageBubble
                m={item.data}
                query={query}
                active={activeKey === key}
              />
            ) : (
              <NoteCard
                note={item.data}
                memberNames={memberNames}
                query={query}
                active={activeKey === key}
              />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Renders `text`, wrapping every occurrence of the (already lowercased)
 * search query in a highlight. The selected match glows brighter.
 */
function Highlight({
  text,
  query,
  active,
}: {
  text: string;
  query: string;
  active: boolean;
}) {
  if (!query) return <>{text}</>;
  const haystack = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let hit = haystack.indexOf(query);
  while (hit !== -1) {
    if (hit > cursor) parts.push(text.slice(cursor, hit));
    parts.push(
      <mark
        key={hit}
        className={cn(
          "rounded px-0.5 text-slate-900",
          active ? "bg-amber-300" : "bg-amber-200",
        )}
      >
        {text.slice(hit, hit + query.length)}
      </mark>,
    );
    cursor = hit + query.length;
    hit = haystack.indexOf(query, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function MessageBubble({
  m,
  query,
  active,
}: {
  m: Message;
  query: string;
  active: boolean;
}) {
  const outbound = m.direction === "outbound";
  const fromBot = outbound && m.sent_by_bot;
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
          outbound
            ? fromBot
              ? "rounded-br-sm bg-emerald-600 text-white"
              : "rounded-br-sm bg-brand-600 text-white"
            : "rounded-bl-sm bg-white text-slate-800",
          active && "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-50",
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
        <p className="whitespace-pre-wrap break-words">
          <Highlight text={m.body ?? ""} query={query} active={active} />
        </p>
        <p
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-right text-[10px]",
            outbound
              ? fromBot
                ? "text-emerald-100"
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
 * cyan that pops on both the brand-blue and green (bot) backgrounds.
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
  query,
  active,
}: {
  note: NoteWithAuthor;
  memberNames: Record<string, string>;
  query: string;
  active: boolean;
}) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm",
          active && "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-50",
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
          <Lock className="h-3 w-3" />
          Internal note · {note.author?.full_name ?? "Someone"}
        </div>
        <p className="whitespace-pre-wrap break-words">
          <Highlight text={note.body} query={query} active={active} />
        </p>
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
