import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/whatsapp/verify";
import { ingestWebhook } from "@/lib/whatsapp/ingest";
import type { WaWebhookBody } from "@/lib/whatsapp/types";

// This route must run on Node.js (uses node:crypto) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — Meta's webhook verification handshake.
 * Meta calls this once with hub.verify_token; we echo hub.challenge back.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST — incoming messages and status updates from Meta.
 * Always return 200 quickly so Meta doesn't retry; log errors instead.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature)) {
    console.warn("[whatsapp] invalid webhook signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  try {
    await ingestWebhook(body);
  } catch (err) {
    // Swallow errors after a 200 would be ideal, but we log + still 200 so Meta
    // doesn't hammer retries for a transient DB issue.
    console.error("[whatsapp] ingest error:", err);
  }

  return new NextResponse("OK", { status: 200 });
}
