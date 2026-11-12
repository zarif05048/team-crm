import { cn } from "@/lib/utils";

/**
 * Small colored chip naming which WhatsApp line a conversation lives on
 * (Dungun / Paka / Marketing / Google web chat / anything else by its display
 * name). With three
 * clinic lines flowing into one inbox, this is how staff tell them apart.
 */

function classify(displayName: string | null | undefined): {
  label: string;
  classes: string;
} {
  const dn = (displayName ?? "").toLowerCase();
  // Google reviews (lib/social) — before the web chat, whose name also says Google.
  if (dn.includes("review")) {
    const where = dn.includes("paka") ? "Paka" : dn.includes("dungun") ? "Dungun" : "";
    return { label: `Reviews${where ? ` · ${where}` : ""}`, classes: "bg-yellow-100 text-yellow-800 ring-yellow-200" };
  }
  // Google web chat (no WhatsApp) — before the branch names, which it contains.
  if (dn.includes("google")) {
    const where = dn.includes("paka") ? "Paka" : dn.includes("dungun") ? "Dungun" : "";
    return { label: `Google${where ? ` · ${where}` : ""}`, classes: "bg-amber-100 text-amber-800 ring-amber-200" };
  }
  // Facebook Messenger / TikTok lines (lib/social) — also before the branch names.
  if (dn.includes("facebook") || dn.includes("tiktok")) {
    const where = dn.includes("paka") ? "Paka" : dn.includes("dungun") ? "Dungun" : "";
    if (dn.includes("comments")) return { label: `FB Comments${where ? ` · ${where}` : ""}`, classes: "bg-indigo-100 text-indigo-800 ring-indigo-200" };
    return dn.includes("facebook")
      ? { label: `Facebook${where ? ` · ${where}` : ""}`, classes: "bg-blue-100 text-blue-800 ring-blue-200" }
      : { label: `TikTok${where ? ` · ${where}` : ""}`, classes: "bg-slate-800 text-white ring-slate-900" };
  }
  // Order matters: the marketing line's name mentions both branches.
  if (dn.includes("marketing")) {
    return { label: "Marketing", classes: "bg-violet-100 text-violet-700 ring-violet-200" };
  }
  if (dn.includes("dungun")) {
    return { label: "Dungun", classes: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
  }
  if (dn.includes("paka")) {
    return { label: "Paka", classes: "bg-sky-100 text-sky-700 ring-sky-200" };
  }
  return {
    label: displayName || "Unknown line",
    classes: "bg-slate-100 text-slate-600 ring-slate-200",
  };
}

/** Short line label ("Marketing" / "Dungun" / "Paka" / raw name) — used by the
 *  inbox line filter so its chips match the badges on each conversation. */
export function lineLabel(displayName: string | null | undefined): string {
  return classify(displayName).label;
}

export function LineBadge({
  displayName,
  className,
}: {
  displayName: string | null | undefined;
  className?: string;
}) {
  const { label, classes } = classify(displayName);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        classes,
        className,
      )}
    >
      {label}
    </span>
  );
}
