import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAll } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fires a Windows/desktop push when the AI bot writes an attention note. Called
 * by a Supabase Database Webhook on INSERT into `notes` (see the migration),
 * which catches notes from EVERY line at once — the official Meta bot AND the
 * three whatsapp-web.js bots on the clinic PC — with no bot code changes.
 *
 * Supabase posts `{ type, table, record, old_record, schema }`. We only act on
 * bot notes (author_id null) whose body starts with the attention emojis, the
 * same rule the in-app AttentionAlerts toasts use.
 *
 * Secured by a bearer secret (PUSH_NOTIFY_SECRET) set as a header on the
 * webhook, so the endpoint can't be triggered by random callers.
 */
const KIND_BY_PREFIX: Record<string, { kind: string; title: string }> = {
  "🚨": { kind: "urgent", title: "🚨 URGENT — patient needs attention now" },
  "🤖": { kind: "staff", title: "Staff attention needed" },
  "📅": { kind: "booking", title: "New booking request" },
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_NOTIFY_SECRET;
  if (!secret) return NextResponse.json({ error: "push not configured" }, { status: 503 });
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    record?: { id?: string; body?: string; author_id?: string | null; conversation_id?: string };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const note = payload.record;
  if (!note?.body || !note.conversation_id) return NextResponse.json({ ok: true, skipped: "no note" });
  if (note.author_id != null) return NextResponse.json({ ok: true, skipped: "human note" });

  const prefix = [...note.body][0] ?? "";
  const meta = KIND_BY_PREFIX[prefix];
  if (!meta) return NextResponse.json({ ok: true, skipped: "not an alert" });

  // A friendlier body: the note text without the leading emoji, plus the
  // patient's name when we can resolve it cheaply.
  const admin = createAdminClient();
  let who = "";
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("contact:contacts(name, profile_name)")
      .eq("id", note.conversation_id)
      .maybeSingle();
    const c = conv?.contact as { name?: string; profile_name?: string } | null;
    who = c?.name || c?.profile_name || "";
  } catch {
    /* name is optional */
  }

  const bodyText = note.body.replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 180);
  const result = await sendPushToAll({
    title: who ? `${meta.title} — ${who}` : meta.title,
    body: bodyText || meta.title,
    url: `/inbox/${note.conversation_id}`,
    tag: note.id || note.conversation_id,
    kind: meta.kind,
  });
  return NextResponse.json({ ok: true, ...result });
}
