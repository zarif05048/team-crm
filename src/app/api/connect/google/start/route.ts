import { NextResponse } from "next/server";
import { adminId, backToSettings, callbackUrl } from "@/lib/social/connect";
import { googleAuthorizeUrl } from "@/lib/social/google";
import { signState } from "@/lib/social/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Channels → "Connect Google reviews": off to Google's own sign-in,
 *  with the Google account that manages the clinics' Business Profiles. */
export async function GET() {
  const uid = await adminId();
  if (!uid) return backToSettings("error", "Only an admin can connect a channel.");
  try {
    return NextResponse.redirect(googleAuthorizeUrl(callbackUrl("google"), signState({ uid, p: "google" })));
  } catch (e) {
    return backToSettings("error", (e as Error).message);
  }
}
