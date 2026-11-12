import { NextResponse } from "next/server";
import { adminId, backToSettings, callbackUrl } from "@/lib/social/connect";
import { isSocialClinic } from "@/lib/social/lines";
import { signState } from "@/lib/social/seal";
import { tiktokAuthorizeUrl, tiktokConfigured } from "@/lib/social/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Channels → "Connect TikTok · Dungun / Paka": off to TikTok's own
 *  sign-in. The clinic is chosen here — a TikTok account's name does not say. */
export async function GET(request: Request) {
  const uid = await adminId();
  if (!uid) return backToSettings("error", "Only an admin can connect a channel.");
  const clinic = new URL(request.url).searchParams.get("clinic");
  if (!isSocialClinic(clinic)) return backToSettings("error", "Choose which clinic the TikTok account belongs to.");
  if (!tiktokConfigured()) {
    return backToSettings("error", "The TikTok app is not set up yet: TIKTOK_APP_ID and TIKTOK_APP_SECRET are missing on the server.");
  }
  return NextResponse.redirect(tiktokAuthorizeUrl(callbackUrl("tiktok"), signState({ uid, p: "tiktok", clinic })));
}
