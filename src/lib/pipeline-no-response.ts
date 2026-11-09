import type { SupabaseClient } from "@supabase/supabase-js";
import { WEIGHT_LOSS_TAG } from "@/lib/data/conversations";
import { unansweredFollowUps } from "@/lib/pipeline-follow-up";

/**
 * Move Follow Up cards with no patient reply for 7 days into Not Respond
 * (owner, 2026-10-10). Runs when the Pipeline page opens (staff's own client,
 * the same RLS path a drag uses) and once a day from the cleanup cron (service
 * client), so cards move even on a day nobody looks at the board.
 *
 * Only threads still in Follow Up are touched (`.eq("stage", "qualified")` on
 * the update too, so a card staff moved meanwhile is left where they put it).
 * Moving a card back to Follow Up by hand records a new follow-up date
 * (setPatientStage), which restarts the seven days. A reply after the move
 * does NOT bring it back — the column is a list for staff to act on.
 */
export async function moveUnansweredFollowUps(
  sb: SupabaseClient,
  today: string,
): Promise<{ moved: number; error?: string }> {
  const { data: tag } = await sb.from("tags").select("id").eq("name", WEIGHT_LOSS_TAG).maybeSingle();
  if (!tag) return { moved: 0 };

  const { data: convos, error } = await sb
    .from("conversations")
    .select("id, contact_id, stage_entered_at, contact:contacts(pipeline_follow_up_at), wl:conversation_tags!inner(tag_id)")
    .eq("wl.tag_id", tag.id)
    .eq("stage", "qualified");
  if (error) return { moved: 0, error: error.message };
  if (!convos?.length) return { moved: 0 };

  type Row = { id: string; contact_id: string; stage_entered_at: string | null;
    contact: { pipeline_follow_up_at: string | null } | { pipeline_follow_up_at: string | null }[] | null };
  const rows = convos as unknown as Row[];
  const contactIds = [...new Set(rows.map((r) => r.contact_id))];

  // A reply on any line counts, as on the board.
  const { data: replies, error: replyError } = await sb
    .from("conversations")
    .select("contact_id, last_inbound_at")
    .in("contact_id", contactIds)
    .not("last_inbound_at", "is", null);
  if (replyError) return { moved: 0, error: replyError.message };
  const latest = new Map<string, string>();
  for (const r of replies ?? []) {
    const cur = latest.get(r.contact_id);
    if (!cur || Date.parse(r.last_inbound_at) > Date.parse(cur)) latest.set(r.contact_id, r.last_inbound_at);
  }

  const ids = unansweredFollowUps(rows.map((r) => {
    const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id,
      contactId: r.contact_id,
      stageEnteredAt: r.stage_entered_at,
      followUpAt: contact?.pipeline_follow_up_at ?? null,
      lastInboundAt: latest.get(r.contact_id) ?? null,
    };
  }), today);
  if (!ids.length) return { moved: 0 };

  const { data: moved, error: moveError } = await sb
    .from("conversations")
    .update({ stage: "no_response" })
    .in("id", ids)
    .eq("stage", "qualified")
    .select("id");
  if (moveError) return { moved: 0, error: moveError.message };
  return { moved: moved?.length ?? 0 };
}
