import { NextResponse } from "next/server";
import { after } from "next/server";
import { verifySignature } from "@/lib/whatsapp/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBotReply, type BotTrigger } from "@/lib/ai/bot";
import { parseFacebookWebhook, type FbWebhookBody } from "@/lib/social/events";
import { accessTokenFor, findAccount, type ChannelAccount } from "@/lib/social/accounts";
import { ingestSocialEvent } from "@/lib/social/ingest";
import { facebookUserName, metaAppId } from "@/lib/social/facebook";

// Messenger messages for the connected Facebook pages (lib/social). Node
// runtime (node:crypto), never cached; the bot reply runs after the 200.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta's verification handshake — the same verify token as the WhatsApp webhook. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("[facebook] invalid webhook signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body: FbWebhookBody;
  try { body = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }

  try {
    const admin = createAdminClient();
    const accounts = new Map<string, ChannelAccount | null>();
    const triggers: BotTrigger[] = [];
    for (const ev of parseFacebookWebhook(body, metaAppId())) {
      if (!accounts.has(ev.accountId)) accounts.set(ev.accountId, await findAccount(admin, "facebook", ev.accountId));
      const acc = accounts.get(ev.accountId);
      if (!acc) continue;   // a page that is not connected here
      const trigger = await ingestSocialEvent(admin, acc, ev, async () =>
        facebookUserName(ev.userId, await accessTokenFor("facebook", acc.external_id, admin)));
      if (trigger) triggers.push(trigger);
    }
    if (triggers.length) {
      after(async () => { for (const t of triggers) await runBotReply(t); });
    }
  } catch (err) {
    // still 200: Meta retries a failed webhook for hours, and a retry of a
    // message already stored is refused by its id anyway
    console.error("[facebook] ingest error:", err);
  }
  return new NextResponse("OK", { status: 200 });
}
