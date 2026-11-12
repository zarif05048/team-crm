// The connected Facebook pages and TikTok accounts (table channel_accounts):
// which clinic each belongs to and the sealed token that lets the CRM read and
// answer its messages. Service role only — the table has RLS on and no policy.
import { createAdminClient } from "@/lib/supabase/admin";
import { seal, unseal } from "./seal";
import type { SocialClinic, SocialProvider } from "./lines";
import { refreshTikTokToken } from "./tiktok";

type Admin = ReturnType<typeof createAdminClient>;

export interface ChannelAccount {
  id: string;
  provider: SocialProvider;
  external_id: string;
  clinic: SocialClinic;
  name: string | null;
  status: "active" | "reauth";
  last_error: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  connected_at: string;
  updated_at: string;
}
interface Row extends ChannelAccount { access_token: string; refresh_token: string | null }

/** What the Settings screen lists — never a token. */
const PUBLIC_COLS = "id, provider, external_id, clinic, name, status, last_error, expires_at, refresh_expires_at, connected_at, updated_at";

export async function listAccounts(admin: Admin = createAdminClient()): Promise<ChannelAccount[]> {
  const { data, error } = await admin.from("channel_accounts").select(PUBLIC_COLS).order("provider").order("clinic");
  if (error) { console.error("[social] listAccounts:", error.message); return []; }
  return (data as ChannelAccount[]) ?? [];
}

export async function findAccount(admin: Admin, provider: SocialProvider, externalId: string): Promise<ChannelAccount | null> {
  const { data } = await admin.from("channel_accounts").select(PUBLIC_COLS)
    .eq("provider", provider).eq("external_id", externalId).maybeSingle();
  return (data as ChannelAccount | null) ?? null;
}

export interface NewAccount {
  provider: SocialProvider; externalId: string; clinic: SocialClinic; name: string | null;
  accessToken: string; refreshToken?: string | null; expiresAt?: string | null; refreshExpiresAt?: string | null;
  connectedBy?: string | null;
}
/** Connect (or reconnect) an account: one row per page / TikTok account. */
export async function saveAccount(admin: Admin, a: NewAccount): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("channel_accounts").upsert({
    provider: a.provider, external_id: a.externalId, clinic: a.clinic, name: a.name,
    access_token: seal(a.accessToken), refresh_token: a.refreshToken ? seal(a.refreshToken) : null,
    expires_at: a.expiresAt ?? null, refresh_expires_at: a.refreshExpiresAt ?? null,
    connected_by: a.connectedBy ?? null, status: "active", last_error: null, updated_at: now,
  }, { onConflict: "provider,external_id" });
  if (error) throw new Error(`saveAccount: ${error.message}`);
}

export async function removeAccount(admin: Admin, id: string): Promise<void> {
  const { error } = await admin.from("channel_accounts").delete().eq("id", id);
  if (error) throw new Error(`removeAccount: ${error.message}`);
}

async function markProblem(admin: Admin, id: string, status: "active" | "reauth", message: string) {
  await admin.from("channel_accounts").update({ status, last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
}
/** Note a failed call on the account's row, so Settings can say what is wrong. */
export async function noteAccountError(provider: SocialProvider, externalId: string, message: string, needsReconnect = false) {
  const admin = createAdminClient();
  const acc = await findAccount(admin, provider, externalId);
  if (acc) await markProblem(admin, acc.id, needsReconnect ? "reauth" : acc.status, message);
}

/** A token that works right now for this account. A Facebook page token does
 *  not expire. A TikTok one lasts a day: it is renewed here when it has under
 *  ten minutes left (and by the daily job, which keeps the renewal token alive). */
export async function accessTokenFor(provider: SocialProvider, externalId: string, admin: Admin = createAdminClient()): Promise<string> {
  const { data } = await admin.from("channel_accounts").select("*")
    .eq("provider", provider).eq("external_id", externalId).maybeSingle();
  const row = data as Row | null;
  if (!row) throw new Error(`This ${provider === "facebook" ? "Facebook page" : "TikTok account"} is not connected (Settings → Channels).`);
  if (provider === "facebook") return unseal(row.access_token);
  const fresh = row.expires_at && Date.parse(row.expires_at) - Date.now() > 10 * 60_000;
  if (fresh) return unseal(row.access_token);
  return (await renewTikTok(admin, row)) ?? unseal(row.access_token);
}

/** Renew one TikTok account's token. Two requests may arrive together; the
 *  row is only written by the one whose copy is still current, and the other
 *  reads what that one saved. Returns the new token, or null when it could not. */
async function renewTikTok(admin: Admin, row: Row): Promise<string | null> {
  if (!row.refresh_token) { await markProblem(admin, row.id, "reauth", "No renewal token — connect the account again."); return null; }
  try {
    const t = await refreshTikTokToken(unseal(row.refresh_token));
    const { data: saved } = await admin.from("channel_accounts").update({
      access_token: seal(t.accessToken), refresh_token: seal(t.refreshToken),
      expires_at: t.expiresAt, refresh_expires_at: t.refreshExpiresAt,
      status: "active", last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("updated_at", row.updated_at).select("id");
    if (saved?.length) return t.accessToken;
    const { data: again } = await admin.from("channel_accounts").select("access_token").eq("id", row.id).maybeSingle();
    return again ? unseal((again as { access_token: string }).access_token) : null;
  } catch (e) {
    const expired = !!row.refresh_expires_at && Date.parse(row.refresh_expires_at) < Date.now();
    await markProblem(admin, row.id, expired ? "reauth" : row.status, `Token renewal failed: ${(e as Error).message}`);
    return null;
  }
}

/** The daily job: renew every TikTok token, so the renewal token itself (which
 *  TikTok replaces each time) never runs out while nobody is messaging. */
export async function renewAllTikTok(admin: Admin = createAdminClient()): Promise<{ renewed: number; failed: number }> {
  const { data } = await admin.from("channel_accounts").select("*").eq("provider", "tiktok");
  let renewed = 0, failed = 0;
  for (const row of (data as Row[] | null) ?? []) {
    if (await renewTikTok(admin, row)) renewed++; else failed++;
  }
  return { renewed, failed };
}
