// TikTok Business Messaging API: the connect exchange, token renewal, the
// webhook address, and sending a message into a conversation.
// Reference: business-api.tiktok.com/portal/docs (Business Messaging).
const API = () => `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION || "v1.3"}`;

export const tiktokConfigured = () => !!process.env.TIKTOK_APP_ID && !!process.env.TIKTOK_APP_SECRET;
function app() {
  const id = process.env.TIKTOK_APP_ID, secret = process.env.TIKTOK_APP_SECRET;
  if (!id || !secret) throw new Error("TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set");
  return { id, secret };
}

/** Read the account's profile and its messages, and answer them. */
export const TT_SCOPES = [
  "user.info.basic", "user.info.username", "user.info.stats", "user.info.profile", "user.account.type", "user.insights",
  "message.list.read", "message.list.send", "message.list.manage",
];

async function call<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${API()}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  // TikTok answers 200 with its own code: 0 is success
  if (!res.ok || data?.code !== 0) {
    throw Object.assign(new Error(data?.message ?? `TikTok API error (HTTP ${res.status})`), { code: data?.code });
  }
  return data.data as T;
}
const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body),
});

export function tiktokAuthorizeUrl(redirectUri: string, state: string): string {
  const u = new URL("https://www.tiktok.com/v2/auth/authorize");
  u.searchParams.set("client_key", app().id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", TT_SCOPES.join(","));
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

export interface TtTokens { accessToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string }
interface TtTokenData { open_id?: string; access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number }
const tokens = (d: TtTokenData): TtTokens => ({
  accessToken: d.access_token, refreshToken: d.refresh_token,
  expiresAt: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + d.refresh_token_expires_in * 1000).toISOString(),
});

/** The sign-in code → the business account's id and its tokens. */
export async function tiktokTokensFromCode(code: string, redirectUri: string): Promise<TtTokens & { businessId: string }> {
  const { id, secret } = app();
  const d = await call<TtTokenData>("tt_user/oauth2/token/", json({
    client_id: id, client_secret: secret, grant_type: "authorization_code", auth_code: code, redirect_uri: redirectUri,
  }));
  if (!d.open_id) throw new Error("TikTok did not say which account this is");
  return { ...tokens(d), businessId: d.open_id };
}

export async function refreshTikTokToken(refreshToken: string): Promise<TtTokens> {
  const { id, secret } = app();
  return tokens(await call<TtTokenData>("tt_user/oauth2/refresh_token/", json({
    client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: refreshToken,
  })));
}

/** "@username" — what the account is called, for the Settings list. */
export async function tiktokAccountName(businessId: string, accessToken: string): Promise<string | null> {
  try {
    const d = await call<{ username?: string; display_name?: string }>("business/get/", {
      headers: { "Access-Token": accessToken },
      query: { business_id: businessId, fields: JSON.stringify(["username", "display_name"]) },
    });
    return d.username ? `@${d.username}` : d.display_name || null;
  } catch { return null; }
}

/** Tell TikTok where to send direct-message events for this app. */
export async function setTikTokWebhook(callbackUrl: string): Promise<void> {
  const { id, secret } = app();
  await call("business/webhook/update/", json({ app_id: id, secret, event_type: "DIRECT_MESSAGE", callback_url: callbackUrl }));
}

export interface TtSendResult { ok: boolean; messageId?: string; error?: string }

async function send(businessId: string, accessToken: string, conversationId: string, content: Record<string, unknown>): Promise<TtSendResult> {
  try {
    const d = await call<{ message?: { message_id?: string } }>("business/message/send/", json(
      { business_id: businessId, recipient_type: "CONVERSATION", recipient: conversationId, ...content },
      { "Access-Token": accessToken },
    ));
    return { ok: true, messageId: d.message?.message_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const sendTikTokText = (businessId: string, accessToken: string, conversationId: string, text: string) =>
  send(businessId, accessToken, conversationId, { message_type: "TEXT", text: { body: text } });

/** A picture by its public address: fetched here, uploaded to TikTok, then
 *  sent. TikTok decides per market whether an account may send pictures. */
export async function sendTikTokImage(businessId: string, accessToken: string, conversationId: string, imageUrl: string): Promise<TtSendResult> {
  try {
    const img = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!img.ok) throw new Error(`could not read the picture (HTTP ${img.status})`);
    const form = new FormData();
    form.set("business_id", businessId);
    form.set("media_type", "IMAGE");
    form.set("file", await img.blob(), imageUrl.split("/").pop() || "image.png");
    const up = await call<{ media_id?: string }>("business/message/media/upload/", {
      method: "POST", headers: { "Access-Token": accessToken }, body: form,
    });
    if (!up.media_id) throw new Error("TikTok did not accept the picture");
    return await send(businessId, accessToken, conversationId, { message_type: "IMAGE", image: { media_id: up.media_id } });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
