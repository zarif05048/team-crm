import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBotReply } from "@/lib/ai/bot";
import {
  BURST_LIMIT,
  BURST_WINDOW_MS,
  MAX_BODY,
  WEB_PREFIX,
  ensureWebConversation,
  findWebConversation,
  isSessionId,
  isWebClinic,
} from "@/lib/webchat";

// The public Google web chat (lib/webchat.ts). No login: the visitor's
// session id — a random UUID their browser made — is the only key, and it
// opens that one conversation and nothing else.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The bot's reply runs in after(), like the WhatsApp webhook.
export const maxDuration = 60;

type Ctx = { params: Promise<{ clinic: string }> };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The visitor's thread, oldest first; `after` (ISO time) returns only newer ones. */
export async function GET(request: Request, { params }: Ctx) {
  const { clinic } = await params;
  if (!isWebClinic(clinic)) return bad("unknown clinic", 404);
  const url = new URL(request.url);
  const session = url.searchParams.get("s");
  if (!isSessionId(session)) return bad("bad session");

  const admin = createAdminClient();
  const conversationId = await findWebConversation(admin, clinic, session);
  if (!conversationId) return NextResponse.json({ messages: [] });

  let q = admin
    .from("messages")
    .select("id, wa_message_id, direction, type, body, media_url, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  const since = url.searchParams.get("after");
  if (since && !Number.isNaN(Date.parse(since))) q = q.gt("created_at", since);
  const { data, error } = await q;
  if (error) return bad("could not load", 500);

  return NextResponse.json(
    {
      messages: (data ?? []).map((m) => ({
        id: m.id,
        // the page's own id for a message it sent, so it can match its draft
        clientId: m.wa_message_id?.startsWith(WEB_PREFIX) ? m.wa_message_id.slice(WEB_PREFIX.length) : null,
        mine: m.direction === "inbound",
        type: m.type,
        body: m.body,
        media_url: m.media_url,
        at: m.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** A visitor's message. Body: { s: session, id: client message id, text }. */
export async function POST(request: Request, { params }: Ctx) {
  const { clinic } = await params;
  if (!isWebClinic(clinic)) return bad("unknown clinic", 404);
  const body = (await request.json().catch(() => null)) as { s?: unknown; id?: unknown; text?: unknown } | null;
  if (!body || !isSessionId(body.s) || !isSessionId(body.id)) return bad("bad request");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return bad("empty");
  if (text.length > MAX_BODY) return bad(`too long (max ${MAX_BODY} characters)`);

  const admin = createAdminClient();
  let conversationId: string;
  try {
    conversationId = await ensureWebConversation(admin, clinic, body.s);
  } catch (err) {
    console.error("[webchat] open conversation failed:", err);
    return bad("could not start the chat", 500);
  }

  // A burst cap per visitor: a real patient never sends this many a minute.
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .gt("created_at", new Date(Date.now() - BURST_WINDOW_MS).toISOString());
  if ((count ?? 0) >= BURST_LIMIT) return bad("Terlalu banyak mesej — sila tunggu sebentar.", 429);

  const waMessageId = WEB_PREFIX + body.id;
  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    wa_message_id: waMessageId,
    direction: "inbound",
    type: "text",
    body: text,
    status: "received",
    created_at: new Date().toISOString(),
  });
  // 23505 = the same message again (a retry after a dropped connection)
  if (error && error.code !== "23505") {
    console.error("[webchat] store message failed:", error.message);
    return bad("could not send", 500);
  }
  if (!error) after(() => runBotReply({ conversationId, waMessageId }));

  return NextResponse.json({ ok: true });
}
