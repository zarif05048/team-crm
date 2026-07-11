"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/inbox/conversation-list";
import { lineLabel } from "@/components/ui/line-badge";
import type { ConversationRow } from "@/lib/data/conversations";

/**
 * Responsive master/detail shell.
 * - Desktop (>=lg): list and thread side by side.
 * - Narrow screens: show the list on /inbox, or the open thread on /inbox/[id].
 *
 * A line filter bar lets staff view one WhatsApp line at a time (Marketing /
 * Dungun / Paka / Official) or all together. Filtering is client-side over the
 * already-loaded list, so switching lines is instant and survives the inbox's
 * realtime refreshes (this component stays mounted).
 */
export function InboxShell({
  conversations,
  children,
}: {
  conversations: ConversationRow[];
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

  // If the selected line has no conversations anymore, fall back to "all".
  const activeLine =
    line !== "all" && lines.some((l) => l.id === line) ? line : "all";
  const filtered =
    activeLine === "all"
      ? conversations
      : conversations.filter((c) => c.whatsapp_number?.id === activeLine);

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
            {filtered.length}
          </span>
        </header>

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
          <ConversationList conversations={filtered} />
        </div>
      </div>

      <div className={cn("min-w-0 flex-1", threadOpen ? "flex" : "hidden lg:flex")}>
        {children}
      </div>
    </div>
  );
}
