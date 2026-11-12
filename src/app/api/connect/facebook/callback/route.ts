import { createAdminClient } from "@/lib/supabase/admin";
import { adminId, backToSettings, callbackUrl, webhookUrl } from "@/lib/social/connect";
import { ensurePageWebhook, facebookPagesFromCode, subscribePage } from "@/lib/social/facebook";
import { saveAccount } from "@/lib/social/accounts";
import { CLINICS, clinicFromName } from "@/lib/social/lines";
import { readState } from "@/lib/social/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Facebook sends the admin back here. Each page they allowed whose name says
 *  Dungun or Paka is connected: its messages switched on, its token stored
 *  sealed. A page that names neither clinic is left alone and said so. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = await adminId();
  const state = readState(url.searchParams.get("state"));
  if (!uid || !state || state.p !== "facebook" || state.uid !== uid) {
    return backToSettings("error", "That Facebook sign-in was not started from here, or it took too long. Try Connect again.");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return backToSettings("error", url.searchParams.get("error_description") || "Facebook sign-in was cancelled.");
  }

  try {
    const pages = await facebookPagesFromCode(code, callbackUrl("facebook"));
    if (!pages.length) return backToSettings("error", "Facebook returned no pages — tick the clinic pages when it asks which ones to allow.");
    await ensurePageWebhook(webhookUrl("facebook"));
    const admin = createAdminClient();
    const connected: string[] = [], skipped: string[] = [], failed: string[] = [];
    for (const page of pages) {
      const clinic = clinicFromName(page.name);
      if (!clinic) { skipped.push(page.name); continue; }
      try {
        await subscribePage(page.id, page.accessToken);
        await saveAccount(admin, {
          provider: "facebook", externalId: page.id, clinic, name: page.name, accessToken: page.accessToken, connectedBy: uid,
        });
        connected.push(`${page.name} (${CLINICS[clinic].branch})`);
      } catch (e) {
        failed.push(`${page.name}: ${(e as Error).message}`);
      }
    }
    const parts = [
      connected.length ? `Connected: ${connected.join(", ")}.` : "",
      skipped.length ? `Left alone (name has neither Dungun nor Paka): ${skipped.join(", ")}.` : "",
      failed.length ? `Failed — ${failed.join("; ")}.` : "",
    ].filter(Boolean).join(" ");
    return backToSettings(connected.length ? "ok" : "error", parts || "No page was connected.");
  } catch (e) {
    return backToSettings("error", `Facebook: ${(e as Error).message}`);
  }
}
