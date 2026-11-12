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
import type { SocialClinic } from "./lines";

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
      for (const r of [...reviews].reverse()) {
        for (const ev of googleReviewEvents(row.external_id, r)) {
          result.seen++;
          const trigger = await ingestSocialEvent(admin, { provider: "google", external_id: row.external_id, clinic: row.clinic, name: row.name }, ev);
          if (trigger) result.triggers.push(trigger);
        }
      }
    } catch (e) {
      const err = e as Error & { reconnect?: boolean };
      result.failed.push(`${row.name ?? row.external_id}: ${err.message}`);
      await noteAccountError("google", row.external_id, `Reading reviews failed: ${err.message}`, !!err.reconnect);
    }
  }
  return result;
}
