"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Highlight } from "@/components/ui/highlight";
import { formatTime } from "@/lib/utils";
import type { MessageHit } from "@/lib/data/conversations";

/**
 * The "Messages" half of inbox search: individual messages whose text matched,
 * newest first, the way WhatsApp lists message hits under the chat hits.
 *
 * Each row opens its conversation with the query in the URL (?q=), so the
 * thread arrives with its own search bar open on that word and scrolled to the
 * match.
 */
export function MessageResults({
  hits,
  query,
}: {
  hits: MessageHit[];
  query: string;
}) {
  if (hits.length === 0) return null;
  return (
    <>
      <p className="border-y border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Messages
      </p>
      <ul className="divide-y divide-slate-100">
        {hits.map((hit) => {
          const name =
            hit.contact.name ?? hit.contact.profile_name ?? hit.contact.wa_id;
          return (
            <li key={hit.id}>
              <Link
                href={`/inbox/${hit.conversation_id}?q=${encodeURIComponent(query)}`}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
              >
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {name}
                    </p>
                    <span
                      className="shrink-0 text-xs text-slate-400"
                      suppressHydrationWarning
                    >
                      {formatTime(hit.created_at)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-500">
                    {hit.direction === "outbound" && (
                      <span className="text-slate-400">You: </span>
                    )}
                    <Highlight text={snippet(hit.body, query)} query={query} />
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Keep the matched word in view for long messages: a window around the first
 * hit rather than the first 120 characters of a bot essay.
 */
function snippet(body: string, query: string, radius = 60): string {
  const at = body.toLowerCase().indexOf(query);
  if (at === -1 || body.length <= radius * 2) return body;
  const start = Math.max(0, at - radius);
  const end = Math.min(body.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}
