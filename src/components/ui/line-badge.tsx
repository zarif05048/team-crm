import { cn } from "@/lib/utils";

/**
 * Small colored chip naming which WhatsApp line a conversation lives on
 * (Dungun / Paka / Marketing / anything else by its display name). With three
 * clinic lines flowing into one inbox, this is how staff tell them apart.
 */

function classify(displayName: string | null | undefined): {
  label: string;
  classes: string;
} {
  const dn = (displayName ?? "").toLowerCase();
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
