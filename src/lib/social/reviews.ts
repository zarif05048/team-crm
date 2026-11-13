// Google reviews into the inbox (owner, 12 Nov 2026: "can connect google
// review with crm"). Google has no free push for new reviews (it would need a
// paid Pub/Sub topic), so they are fetched: every 10 minutes from Supabase's
// own scheduler (supabase/migrations/2026-11-13_google_reviews.sql), once a
// day from the Vercel cron as a fallback, and right after an account connects.
// Each run reads the newest 50 reviews of every connected profile; a review
// already in the inbox is refused by its id, so a run that finds nothing new
// writes nothing.
import { createAdminClient } from "@/lib/supabase/admin";
import type { BotTrigger } from "@/lib/ai/bot";
import { accessTokenFor, noteAccountError } from "./accounts";
import { googleReviewEvents } from "./events";
import { listGoogleReviews } from "./google";
import { ingestSocialEvent } from "./ingest";
import { messageId, type SocialClinic } from "./lines";

type Admin = ReturnType<typeof createAdminClient>;

export interface ReviewSync { profiles: number; seen: number; failed: string[]; triggers: BotTrigger[] }

export async function syncGoogleReviews(admin: Admin = createAdminClient()): Promise<ReviewSync> {
  const { data } = await admin.from("channel_accounts").select("external_id, clinic, name").eq("provider", "google");
  const rows = (data as { external_id: string; clinic: SocialClinic; name: string | null }[] | null) ?? [];
  const result: ReviewSync = { profiles: rows.length, seen: 0, failed: [], triggers: [] };
  for (const row of rows) {
    try {
      const token = await accessTokenFor("google", row.external_id, admin);
      const reviews = await listGoogleReviews(token, row.external_id);
      // oldest first, so each thread's messages arrive in the order they happened
      const events = [...reviews].reverse().flatMap((r) => googleReviewEvents(row.external_id, r));
      result.seen += events.length;
      /* Only what is not stored yet. Every run reads the newest 50 reviews, and
         nearly all of them are already here; handing each to ingest anyway cost
         ~4 Supabase requests apiece just to be refused — some 57,000 a day at
         one run every 10 minutes, on the free plan's request-log quota
         (memory: supabase-free-quota). One query says which are new. */
      const ids = events.map((ev) => messageId("greviews", ev.messageId));
      const stored = new Set<string>();
      if (ids.length) {
        const { data: have, error } = await admin.from("messages").select("wa_message_id").in("wa_message_id", ids);
        if (error) throw new Error(`checking stored reviews: ${error.message}`);
        for (const m of (have as { wa_message_id: string }[] | null) ?? []) stored.add(m.wa_message_id);
      }
      for (const ev of events) {
        if (stored.has(messageId("greviews", ev.messageId))) continue;
        const trigger = await ingestSocialEvent(admin, { provider: "google", external_id: row.external_id, clinic: row.clinic, name: row.name }, ev);
        if (trigger) result.triggers.push(trigger);
      }
    } catch (e) {
      const err = e as Error & { reconnect?: boolean };
      result.failed.push(`${row.name ?? row.external_id}: ${err.message}`);
      await noteAccountError("google", row.external_id, `Reading reviews failed: ${err.message}`, !!err.reconnect);
    }
  }
  return result;
}
