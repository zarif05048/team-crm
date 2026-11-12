// Facebook pages: Messenger send, the connect (Facebook Login) exchange, and
// the webhook subscriptions. Graph API, the same Meta app as the WhatsApp line.
const GRAPH = "https://graph.facebook.com";
const version = () => process.env.WHATSAPP_API_VERSION || "v21.0";

/** The CRM's Meta app id — an identifier, not a secret (docs/PROJECT_CONTEXT.md). */
export const metaAppId = () => process.env.META_APP_ID || "1013631327812903";
function appSecret(): string {
  const s = process.env.META_APP_SECRET;
  if (!s) throw new Error("META_APP_SECRET is not set");
  return s;
}

/** What the pages are asked for: list them, read and answer their messages,
 *  and switch on the webhook for each. */
export const FB_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata"];
const PAGE_FIELDS = "messages,messaging_postbacks,message_echoes";

async function graph<T>(path: string, init?: RequestInit & { query?: Record<string, string> }): Promise<T> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error;
    throw Object.assign(new Error(e?.message ?? `Facebook API error (HTTP ${res.status})`), { code: e?.code, subcode: e?.error_subcode });
  }
  return data as T;
}

export function facebookAuthorizeUrl(redirectUri: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${version()}/dialog/oauth`);
  u.searchParams.set("client_id", metaAppId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", FB_SCOPES.join(","));
  return u.toString();
}

export interface FbPage { id: string; name: string; accessToken: string }

/** The sign-in code → the pages that person manages, each with a page token
 *  that does not expire (it comes off a long-lived user token). The user token
 *  itself is not kept. */
export async function facebookPagesFromCode(code: string, redirectUri: string): Promise<FbPage[]> {
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    query: { client_id: metaAppId(), client_secret: appSecret(), redirect_uri: redirectUri, code },
  });
  const long = await graph<{ access_token: string }>("oauth/access_token", {
    query: { grant_type: "fb_exchange_token", client_id: metaAppId(), client_secret: appSecret(), fb_exchange_token: short.access_token },
  });
  const pages = await graph<{ data?: { id: string; name: string; access_token: string }[] }>("me/accounts", {
    query: { fields: "id,name,access_token", limit: "100", access_token: long.access_token },
  });
  return (pages.data ?? []).filter((p) => p.id && p.access_token).map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
}

/** Have Meta send this page's messages to the app (the page's own switch). */
export async function subscribePage(pageId: string, pageToken: string): Promise<void> {
  await graph(`${pageId}/subscribed_apps`, { method: "POST", query: { subscribed_fields: PAGE_FIELDS, access_token: pageToken } });
}
export async function unsubscribePage(pageId: string, pageToken: string): Promise<void> {
  await graph(`${pageId}/subscribed_apps`, { method: "DELETE", query: { access_token: pageToken } });
}

/** Point the app's Page webhook at this CRM (the app's switch; once is enough,
 *  repeating it is harmless). Meta calls the URL back with the verify token. */
export async function ensurePageWebhook(callbackUrl: string): Promise<void> {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verify) throw new Error("WHATSAPP_VERIFY_TOKEN is not set");
  await graph(`${metaAppId()}/subscriptions`, {
    method: "POST",
    query: {
      object: "page", callback_url: callbackUrl, fields: PAGE_FIELDS, verify_token: verify,
      access_token: `${metaAppId()}|${appSecret()}`,
    },
  });
}

/** The person's name, when Meta will give it (it needs a permission the app
 *  may not have yet — then the inbox names them "Facebook XXXX"). */
export async function facebookUserName(psid: string, pageToken: string): Promise<string | null> {
  try {
    const p = await graph<{ first_name?: string; last_name?: string; name?: string }>(psid, {
      query: { fields: "first_name,last_name,name", access_token: pageToken },
    });
    return (p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim() || null;
  } catch { return null; }
}

export interface FbSendResult { ok: boolean; messageId?: string; error?: string; reconnect?: boolean }

/** One Messenger message to a person (inside the 24-hour window). */
export async function sendFacebookMessage(
  pageId: string, pageToken: string, psid: string, message: Record<string, unknown>,
): Promise<FbSendResult> {
  try {
    const r = await graph<{ message_id?: string }>(`${pageId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      query: { access_token: pageToken },
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message }),
    });
    return { ok: true, messageId: r.message_id };
  } catch (e) {
    const err = e as Error & { code?: number };
    // 190: the page token no longer works (password change, access removed)
    return { ok: false, error: err.message, reconnect: err.code === 190 };
  }
}
