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
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2">
            <FilterChip
              label="All"
              count={conversations.length}
              active={activeLine === "all"}
              onClick={() => setLine("all")}
            />
            {lines.map((l) => (
              <FilterChip
                key={l.id}
                label={l.label}
                count={l.count}
                active={activeLine === l.id}
                onClick={() => setLine(l.id)}
              />
            ))}
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

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold",
          active ? "bg-white/25 text-white" : "bg-white text-slate-500",
        )}
      >
        {count}
      </span>
    </button>
  );
}
