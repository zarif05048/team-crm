import { cn } from "@/lib/utils";

/**
 * Renders `text` with every occurrence of `query` marked — the yellow hits
 * behind both searches (in-conversation and inbox).
 *
 * `query` must already be lowercased and trimmed; an empty query renders the
 * text untouched.
 */
export function Highlight({
  text,
  query,
  active = false,
}: {
  text: string;
  query: string;
  /** The selected match, drawn brighter than the rest. */
  active?: boolean;
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
