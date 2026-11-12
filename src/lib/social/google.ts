// Google reviews (owner, 12 Nov 2026: "can connect google review with crm"):
// the sign-in that lets the CRM read and answer the reviews of the clinics'
// Google Business Profiles, and the Business Profile API calls themselves.
//
// The Google Cloud project is "Hijraa CRM Google Reviews" (northern-union-514511-t2,
// under zarif05048@gmail.com), allowlisted for the Business Profile API on
// 12 Nov 2026 (case 9-7826000041202). Its OAuth client id and secret are
// GOOGLE_BP_CLIENT_ID / GOOGLE_BP_CLIENT_SECRET on the server — added by the
// owner; without them the Connect button stays hidden.

import type { GoogleReview } from "./events";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
/** Read the Business Profiles, and post replies to their reviews. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";

export const googleConfigured = () => !!(process.env.GOOGLE_BP_CLIENT_ID && process.env.GOOGLE_BP_CLIENT_SECRET);
function client(): { id: string; secret: string } {
  const id = process.env.GOOGLE_BP_CLIENT_ID, secret = process.env.GOOGLE_BP_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google sign-in is not set up yet (GOOGLE_BP_CLIENT_ID / GOOGLE_BP_CLIENT_SECRET on the server).");
  return { id, secret };
}

/** A Google error, with whether the sign-in itself no longer works. */
export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number, readonly reconnect: boolean) { super(message); }
}

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { message?: string; status?: string } | string; error_description?: string });
    const msg = typeof e.error === "string" ? `${e.error}${e.error_description ? `: ${e.error_description}` : ""}` : e.error?.message;
    // 401 / invalid_grant: the sign-in was revoked or expired — connect again
    const reconnect = res.status === 401 || (typeof e.error === "string" && e.error === "invalid_grant");
    throw new GoogleApiError(msg || `Google API error (HTTP ${res.status})`, res.status, reconnect);
  }
  return data as T;
}

/** Off to Google's own sign-in. `prompt=consent` so Google always hands back a
 *  renewal token — without one the CRM would lose access within the hour. */
export function googleAuthorizeUrl(redirectUri: string, state: string): string {
  const u = new URL(AUTH);
  u.searchParams.set("client_id", client().id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPE);
  u.searchParams.set("access_type", "offline");
  // select_account: Google always asks which account — Dungun and Paka are managed by different ones
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export interface GoogleTokens { accessToken: string; refreshToken: string | null; expiresAt: string }
interface TokenReply { access_token: string; refresh_token?: string; expires_in?: number }
const expiry = (t: TokenReply) => new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();

export async function googleTokensFromCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const { id, secret } = client();
  const t = await call<TokenReply>(TOKEN, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t) };
}

/** A fresh access token (an hour) from the renewal token, which does not change. */
export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const { id, secret } = client();
  const t = await call<TokenReply>(TOKEN, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  return { accessToken: t.access_token, expiresAt: expiry(t) };
}

export interface GoogleLocation {
  /** "accounts/<account>/locations/<location>" — the v4 reviews path */
  id: string;
  title: string;
}
/** Every Business Profile the signed-in Google account manages. */
export async function listGoogleLocations(token: string): Promise<GoogleLocation[]> {
  const accounts = await call<{ accounts?: { name: string }[] }>(`${ACCOUNTS}/accounts?pageSize=20`, { token });
  const out: GoogleLocation[] = [];
  for (const a of accounts.accounts ?? []) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ readMask: "name,title", pageSize: "100" });
      if (pageToken) q.set("pageToken", pageToken);
      const page = await call<{ locations?: { name: string; title?: string }[]; nextPageToken?: string }>(
        `${INFO}/${a.name}/locations?${q}`, { token });
      for (const l of page.locations ?? []) {
        // "locations/123" under "accounts/456"
        out.push({ id: `${a.name}/${l.name}`, title: l.title ?? l.name });
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  // the same profile can be reachable through two accounts (owner + a group)
  return out.filter((l, i) => out.findIndex((o) => o.id.split("/").pop() === l.id.split("/").pop()) === i);
}

/** The newest reviews of one location, newest first. */
export async function listGoogleReviews(token: string, locationId: string, pageSize = 50): Promise<GoogleReview[]> {
  const q = new URLSearchParams({ pageSize: String(pageSize), orderBy: "updateTime desc" });
  const r = await call<{ reviews?: GoogleReview[] }>(`${V4}/${locationId}/reviews?${q}`, { token });
  return r.reviews ?? [];
}

/** Post (or replace) the clinic's public reply under a review. */
export async function replyToGoogleReview(token: string, locationId: string, reviewId: string, text: string): Promise<void> {
  await call(`${V4}/${locationId}/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: "PUT", token, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: text }),
  });
}
