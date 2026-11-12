import { NextResponse } from "next/server";
import { adminId, backToSettings, callbackUrl } from "@/lib/social/connect";
import { facebookAuthorizeUrl } from "@/lib/social/facebook";
import { signState } from "@/lib/social/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Channels → "Connect Facebook pages": off to Facebook's own
 *  sign-in, where the admin chooses which pages the CRM may answer for. */
export async function GET() {
  const uid = await adminId();
  if (!uid) return backToSettings("error", "Only an admin can connect a channel.");
  try {
    return NextResponse.redirect(facebookAuthorizeUrl(callbackUrl("facebook"), signState({ uid, p: "facebook" })));
  } catch (e) {
    return backToSettings("error", (e as Error).message);
  }
}
