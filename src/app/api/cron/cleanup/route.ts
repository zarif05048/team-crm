import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron, logCronRun } from "@/lib/cron-auth";

// Node runtime (service-role client) and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily retention cleanup — keeps the free-tier Supabase database small.
 *
 * Deletes patient MESSAGES older than the retention window (default 12 months;
 * override with MESSAGE_RETENTION_DAYS). Contacts, conversations and internal
 * notes are deliberately KEPT — they're few and hold booking/handoff history.
 * Also prunes the transient bridge_outbox queue (sent/failed rows > 30 days).
 *
 * Runs via a Vercel Cron (see vercel.json). Only the Vercel scheduler (which
 * carries CRON_SECRET) and the signed-in clinic owner may start it — see
 * `authorizeCron`. It must never be publicly triggerable: it deletes data.
 * Every attempt, allowed or refused, is recorded in `cron_runs`. Touching the
 * DB daily also keeps the project from hitting Supabase's ~1-week idle pause.
 */
async function runCleanup(request: Request) {
  const auth = await authorizeCron(request);
  if (!auth.ok) {
    await logCronRun({
      job: "cleanup",
      triggeredBy: auth.triggeredBy,
      allowed: false,
      detail: { error: auth.error },
    });
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const retentionDays = Number(process.env.MESSAGE_RETENTION_DAYS) || 365;
  const msgCutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const outboxCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const sb = createAdminClient();

  // Old messages beyond the retention window.
  const { count: messagesDeleted, error: msgErr } = await sb
    .from("messages")
    .delete({ count: "exact" })
    .lt("created_at", msgCutoff);
  if (msgErr) {
    return NextResponse.json({ ok: false, stage: "messages", error: msgErr.message }, { status: 500 });
  }

  // Transient outbox rows that have already been sent or failed.
  const { count: outboxDeleted, error: outErr } = await sb
    .from("bridge_outbox")
    .delete({ count: "exact" })
    .lt("created_at", outboxCutoff)
    .in("status", ["sent", "failed"]);
  // bridge_outbox may not exist on every deploy — don't fail the whole run for it.
  if (outErr && outErr.code !== "42P01") {
    return NextResponse.json({ ok: false, stage: "bridge_outbox", error: outErr.message }, { status: 500 });
  }

  await logCronRun({
    job: "cleanup",
    triggeredBy: auth.triggeredBy,
    allowed: true,
    detail: {
      retentionDays,
      messagesDeleted: messagesDeleted ?? 0,
      outboxDeleted: outboxDeleted ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    triggeredBy: auth.triggeredBy,
    retentionDays,
    messageCutoff: msgCutoff,
    messagesDeleted: messagesDeleted ?? 0,
    outboxDeleted: outboxDeleted ?? 0,
    ranAt: new Date().toISOString(),
  });
}

// Vercel Cron issues a GET; POST is allowed for manual triggering with the secret.
export const GET = runCleanup;
export const POST = runCleanup;
