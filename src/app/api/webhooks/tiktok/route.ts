import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBotReply } from "@/lib/ai/bot";
import { parseTikTokWebhook, verifyTikTokSignature, type TtWebhookBody } from "@/lib/social/events";
import { findAccount } from "@/lib/social/accounts";
import { ingestSocialEvent } from "@/lib/social/ingest";

// Direct messages for the connected TikTok accounts (lib/social).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How long an "account wrote" event waits before it is read: a message this
 *  CRM sent comes back as one, and must find its own row already stored. */
const ECHO_DELAY_MS = 3000;

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: TtWebhookBody;
  try { body = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }
  // not a message event (a check of the address): acknowledged, nothing read
  if (!body?.event) return new NextResponse("OK", { status: 200 });
  if (!verifyTikTokSignature(raw, request.headers.get("tiktok-signature"), process.env.TIKTOK_APP_SECRET)) {
    console.warn("[tiktok] invalid webhook signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  try {
    const admin = createAdminClient();
    for (const ev of parseTikTokWebhook(body)) {
      const acc = await findAccount(admin, "tiktok", ev.accountId);
      if (!acc) continue;   // an account that is not connected here
      if (ev.direction === "out") {
        after(async () => {
          await new Promise((r) => setTimeout(r, ECHO_DELAY_MS));
          await ingestSocialEvent(admin, acc, ev).catch((e) => console.error("[tiktok] echo error:", e));
        });
        continue;
      }
      const trigger = await ingestSocialEvent(admin, acc, ev);
      if (trigger) after(() => runBotReply(trigger));
    }
  } catch (err) {
    console.error("[tiktok] ingest error:", err);
  }
  return new NextResponse("OK", { status: 200 });
}
