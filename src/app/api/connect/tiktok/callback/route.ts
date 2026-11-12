import { createAdminClient } from "@/lib/supabase/admin";
import { adminId, backToSettings, callbackUrl, webhookUrl } from "@/lib/social/connect";
import { saveAccount } from "@/lib/social/accounts";
import { CLINICS, isSocialClinic } from "@/lib/social/lines";
import { readState } from "@/lib/social/seal";
import { setTikTokWebhook, tiktokAccountName, tiktokTokensFromCode } from "@/lib/social/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** TikTok sends the admin back here: the account's tokens are stored sealed
 *  and TikTok is told where to send its direct messages. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = await adminId();
  const state = readState(url.searchParams.get("state"));
  if (!uid || !state || state.p !== "tiktok" || state.uid !== uid || !isSocialClinic(state.clinic)) {
    return backToSettings("error", "That TikTok sign-in was not started from here, or it took too long. Try Connect again.");
  }
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
  if (!code) {
    return backToSettings("error", url.searchParams.get("error_description") || "TikTok sign-in was cancelled.");
  }

  try {
    const t = await tiktokTokensFromCode(code, callbackUrl("tiktok"));
    const name = await tiktokAccountName(t.businessId, t.accessToken);
    await saveAccount(createAdminClient(), {
      provider: "tiktok", externalId: t.businessId, clinic: state.clinic, name,
      accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt, refreshExpiresAt: t.refreshExpiresAt,
      connectedBy: uid,
    });
    let note = "";
    try { await setTikTokWebhook(webhookUrl("tiktok")); }
    catch (e) { note = ` But TikTok did not accept the message address: ${(e as Error).message}`; }
    return backToSettings(note ? "error" : "ok", `Connected TikTok ${name ?? "account"} (${CLINICS[state.clinic].branch}).${note}`);
  } catch (e) {
    return backToSettings("error", `TikTok: ${(e as Error).message}`);
  }
}
