import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminId, backToSettings, callbackUrl } from "@/lib/social/connect";
import { googleTokensFromCode, listGoogleLocations } from "@/lib/social/google";
import { saveAccount } from "@/lib/social/accounts";
import { CLINICS, clinicFromName } from "@/lib/social/lines";
import { readState } from "@/lib/social/seal";
import { syncGoogleReviews } from "@/lib/social/reviews";
import { runBotReply } from "@/lib/ai/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Google sends the admin back here. Each Business Profile the account
 *  manages whose name says Dungun or Paka is connected, its renewal token
 *  stored sealed, and its recent reviews are brought in straight away. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = await adminId();
  const state = readState(url.searchParams.get("state"));
  if (!uid || !state || state.p !== "google" || state.uid !== uid) {
    return backToSettings("error", "That Google sign-in was not started from here, or it took too long. Try Connect again.");
  }
  const code = url.searchParams.get("code");
  if (!code) return backToSettings("error", url.searchParams.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in did not finish.");

  try {
    const t = await googleTokensFromCode(code, callbackUrl("google"));
    if (!t.refreshToken) return backToSettings("error", "Google gave no renewal token. Remove \"Hijraa CRM\" from the Google account's third-party access, then connect again.");
    const locations = await listGoogleLocations(t.accessToken);
    if (!locations.length) return backToSettings("error", "That Google account manages no Business Profile. Sign in with the account that manages the clinic's profile.");
    const admin = createAdminClient();
    const connected: string[] = [], skipped: string[] = [];
    for (const loc of locations) {
      const clinic = clinicFromName(loc.title);
      if (!clinic) { skipped.push(loc.title); continue; }
      await saveAccount(admin, {
        provider: "google", externalId: loc.id, clinic, name: loc.title,
        accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt, connectedBy: uid,
      });
      connected.push(`${loc.title} (${CLINICS[clinic].branch})`);
    }
    if (connected.length) {
      // the latest reviews now, not in ten minutes
      after(async () => {
        const r = await syncGoogleReviews(admin);
        console.log(`[google-reviews] first sync: ${r.seen} seen, ${r.triggers.length} for the bot, ${r.failed.length} failed`);
        for (const t of r.triggers) await runBotReply(t);
      });
    }
    const parts = [
      connected.length ? `Connected: ${connected.join(", ")}. Recent reviews are coming into the inbox.` : "",
      skipped.length ? `Left alone (name has neither Dungun nor Paka): ${skipped.join(", ")}.` : "",
    ].filter(Boolean).join(" ");
    return backToSettings(connected.length ? "ok" : "error", parts || "No profile was connected.");
  } catch (e) {
    return backToSettings("error", `Google: ${(e as Error).message}`);
  }
}
