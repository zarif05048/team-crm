import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * Runs via a Vercel Cron (see vercel.json). Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set, so
 * the endpoint refuses anything without the matching secret — it must never be
 * publicly triggerable (it deletes data). Touching the DB daily also keeps the
 * project from hitting Supabase's ~1-week idle pause.
 */
async function runCleanup(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: without a secret this would be an open deletion endpoint.
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
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
