"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageResults } from "@/components/inbox/message-results";
import { useInboxSearch } from "@/components/inbox/use-inbox-search";
import { lineLabel } from "@/components/ui/line-badge";
import type { ConversationListRow } from "@/lib/data/conversations";

/**
 * Responsive master/detail shell.
 * - Desktop (>=lg): list and thread side by side.
 * - Narrow screens: show the list on /inbox, or the open thread on /inbox/[id].
 *
 * A line filter bar lets staff view one WhatsApp line at a time (Marketing /
 * Dungun / Paka / Official) or all together. Filtering is client-side over the
 * already-loaded list, so switching lines is instant and survives the inbox's
 * realtime refreshes (this component stays mounted).
 *
 * The search box above it works the same way for the loaded chats, and falls
 * back to a debounced server search for anyone older than the newest 200 (see
 * useInboxSearch). The line filter applies to both sets.
 */
export function InboxShell({
  conversations,
  children,
}: {
  conversations: ConversationListRow[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname !== "/inbox" && pathname.startsWith("/inbox/");

  // "all" or a whatsapp_number.id.
  const [line, setLine] = useState<string>("all");

  // Distinct lines present in the current list, with per-line counts.
  const lines = useMemo(() => {
    const m = new Map<string, { id: string; label: string; count: number }>();
    for (const c of conversations) {
      const id = c.whatsapp_number?.id;
      if (!id) continue;
      const found = m.get(id);
      if (found) found.count++;
      else m.set(id, { id, label: lineLabel(c.whatsapp_number?.display_name), count: 1 });
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [conversations]);

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { loaded, older, messages, searching } = useInboxSearch(
    conversations,
    query,
  );

  // If the selected line has no conversations anymore, fall back to "all".
  const activeLine =
    line !== "all" && lines.some((l) => l.id === line) ? line : "all";
  const onLine = (rows: ConversationListRow[]) =>
    activeLine === "all"
      ? rows
      : rows.filter((c) => c.whatsapp_number?.id === activeLine);

  const filtered = onLine(loaded);
  const olderResults = onLine(older);
  const messageHits =
    activeLine === "all"
      ? messages
      : messages.filter((m) => m.whatsapp_number_id === activeLine);
  const searchQuery = query.trim().toLowerCase();
  const noResults =
    searchQuery.length > 0 &&
    filtered.length === 0 &&
    olderResults.length === 0 &&
    messageHits.length === 0 &&
    !searching;

  return (
    <div className="flex h-full">
      <div
        className={cn(
          "w-full flex-col border-r border-slate-200 bg-white lg:flex lg:max-w-sm",
          threadOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <h1 className="text-base font-semibold text-slate-900">Inbox</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {filtered.length + olderResults.length}
          </span>
        </header>

        <div className="border-b border-slate-200 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              // Not type="search": WebKit adds its own clear button, which
              // would sit next to ours.
              type="text"
              placeholder="Search name or phone number…"
              aria-label="Search conversations"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {lines.length > 1 && (
          <div className="border-b border-slate-200 px-3 py-2">
            <select
              value={activeLine}
              onChange={(e) => setLine(e.target.value)}
              aria-label="Filter by WhatsApp line"
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All lines ({conversations.length})</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} ({l.count})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <ConversationList conversations={filtered} query={searchQuery} />

          {/* Chats older than the newest 200 the inbox holds, found on the
              server. Labelled so it's clear why they appear below the rest. */}
          {olderResults.length > 0 && (
            <>
              <p className="border-y border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Older chats
              </p>
              <ConversationList
                conversations={olderResults}
                query={searchQuery}
              />
            </>
          )}

          <MessageResults hits={messageHits} query={searchQuery} />

          {searching && (
            <p className="px-4 py-3 text-xs text-slate-400">
              Searching older chats and messages…
            </p>
          )}

          {noResults && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">No results</p>
              <p className="mt-1 text-xs text-slate-400">
                Searched names, phone numbers and message text. Try a shorter
                word, or part of the number.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={cn("min-w-0 flex-1", threadOpen ? "flex" : "hidden lg:flex")}>
        {children}
      </div>
    </div>
  );
}
