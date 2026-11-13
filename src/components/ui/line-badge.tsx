import { Globe, Megaphone, MessageCircle, MessageSquareText, MessagesSquare, Music2, Phone, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small chip naming which line a conversation lives on — the channel by
 * colour and icon (WhatsApp green, Google Review amber, Facebook blue…), the
 * branch in words. The colours are the .chan-* sets in globals.css, one for
 * the light theme and one for the dark, so a badge reads the same in both
 * (owner, 13 Nov 2026: "make the inbox colour design nice, more practical").
 */

export type ChannelTone = "wa" | "review" | "fb" | "fbc" | "tt" | "web" | "mkt" | "other";

const ICON: Record<ChannelTone, LucideIcon> = {
  wa: MessageCircle, review: Star, fb: MessagesSquare, fbc: MessageSquareText,
  tt: Music2, web: Globe, mkt: Megaphone, other: Phone,
};

/** The tag a line's threads all carry anyway — the badge already says it. */
export const CHANNEL_TAG: Partial<Record<ChannelTone, string>> = {
  review: "google-review", fb: "facebook", fbc: "facebook-comment", tt: "tiktok",
};

function classify(displayName: string | null | undefined): { label: string; tone: ChannelTone; paka: boolean } {
  return { ...classifyTone(displayName), paka: /paka/i.test(displayName ?? "") && !/marketing/i.test(displayName ?? "") };
}
function classifyTone(displayName: string | null | undefined): { label: string; tone: ChannelTone } {
  const dn = (displayName ?? "").toLowerCase();
  const where = dn.includes("paka") ? "Paka" : dn.includes("dungun") ? "Dungun" : "";
  const at = (s: string) => (where ? `${s} · ${where}` : s);
  // Order matters: names below contain each other ("Google Reviews" and
  // "Google Chat" both say Google; the marketing line names both branches).
  if (dn.includes("review")) return { label: at("Review"), tone: "review" };
  if (dn.includes("google")) return { label: at("Web chat"), tone: "web" };
  if (dn.includes("facebook")) return dn.includes("comments") ? { label: at("FB Comment"), tone: "fbc" } : { label: at("Facebook"), tone: "fb" };
  if (dn.includes("tiktok")) return { label: at("TikTok"), tone: "tt" };
  if (dn.includes("marketing")) return { label: "Marketing", tone: "mkt" };
  if (where) return { label: `WhatsApp · ${where}`, tone: "wa" };
  return { label: displayName || "Unknown line", tone: "other" };
}

/** The badge's words ("WhatsApp · Dungun", "Review · Paka"…) — also the
 *  inbox filter's and the analytics' name for a line. */
export function lineLabel(displayName: string | null | undefined): string {
  return classify(displayName).label;
}
/** Which channel colour a line takes. */
export function lineTone(displayName: string | null | undefined): ChannelTone {
  return classify(displayName).tone;
}

export function LineBadge({
  displayName,
  className,
}: {
  displayName: string | null | undefined;
  className?: string;
}) {
  const { label, tone, paka } = classify(displayName);
  const Icon = ICON[tone];
  return (
    <span
      className={cn(
        "chan-badge inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        `chan-${tone}`,
        // Paka solid, Dungun outlined — the same channel colour, the branch told apart at a glance
        // (owner, 13 Nov 2026: "make dungun and paka in different font or bubble colour")
        paka && "chan-solid font-bold",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden fill={tone === "review" ? "currentColor" : "none"} />
      {label}
    </span>
  );
}
