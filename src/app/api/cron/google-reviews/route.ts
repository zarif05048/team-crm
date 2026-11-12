import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGoogleReviews } from "@/lib/social/reviews";
import { runBotReply } from "@/lib/ai/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* New Google reviews into the inbox (lib/social/reviews.ts). Called every 10
   minutes by Supabase's scheduler (pg_cron + pg_net, see
   supabase/migrations/2026-11-13_google_reviews.sql) — which holds no secret,
   so this route needs none: all it can do is read the clinics' own reviews and
   bring in the new ones, which a review already stored refuses. To keep a
   stranger from making it call Google in a loop, a run within 3 minutes of the
   last one does nothing. Each run is one row in cron_runs; a week is kept. */
const MIN_GAP_MS = 3 * 60_000;
const JOB = "google-reviews";

async function run() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - MIN_GAP_MS).toISOString();
  const { data: recent } = await admin.from("cron_runs").select("id").eq("job", JOB).eq("allowed", true).gte("created_at", since).limit(1);
  if (recent?.length) return NextResponse.json({ ok: true, skipped: "ran less than 3 minutes ago" });
  // claim the run first, so two calls at once do not both read Google
  await admin.from("cron_runs").insert({ job: JOB, triggered_by: "scheduler", allowed: true, detail: { started: true } });

  const r = await syncGoogleReviews(admin);
  if (r.triggers.length) after(async () => { for (const t of r.triggers) await runBotReply(t); });
  if (r.failed.length) console.error("[google-reviews] failed:", r.failed.join(" | "));
  await admin.from("cron_runs").delete().eq("job", JOB).lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return NextResponse.json({ ok: true, profiles: r.profiles, seen: r.seen, forBot: r.triggers.length, failed: r.failed.length });
}

export const GET = run;
export const POST = run;
