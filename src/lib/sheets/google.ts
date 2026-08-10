// Minimal Google Sheets API client (service account → JWT → access token).
//
// Deliberately dependency-free: the official `googleapis` package is ~50 MB of
// generated code for the three calls we make, so we sign the JWT with node
// crypto and talk to the REST API with fetch.
//
// Setup (see docs/TCA_SHEET_SETUP.md for the click-by-click version):
//   1. Google Cloud → service account → JSON key.
//   2. Paste the whole JSON into the GOOGLE_SERVICE_ACCOUNT_JSON env var.
//   3. Share the spreadsheet with the service account's email (Editor).
// With the env var unset, every call here returns a disabled result and the
// CRM carries on as before — same fail-soft rule as ANTHROPIC_API_KEY.

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

function credentials(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) {
      console.error("[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key");
      return null;
    }
    return {
      client_email: parsed.client_email,
      // Vercel env values often arrive with the newlines escaped.
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    console.error("[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

/** Is the Sheets integration configured at all? */
export function sheetsEnabled(): boolean {
  return credentials() !== null;
}

const b64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

async function accessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const creds = credentials();
  if (!creds) return null;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify(claim),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(creds.private_key);
  const assertion = `${unsigned}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    console.error("[sheets] token request failed:", json.error_description ?? res.status);
    return null;
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await accessToken();
  if (!token) {
    return {
      ok: false,
      error: sheetsEnabled()
        ? "Google sign-in failed — check the service account key."
        : "Google Sheets is not configured.",
    };
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[sheets] ${path} failed:`, res.status, text.slice(0, 400));
    return { ok: false, error: `Google Sheets API ${res.status}` };
  }
  return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
}

/** Titles of every tab in the spreadsheet, left to right. */
export async function listTabs(
  spreadsheetId: string,
): Promise<{ ok: true; titles: string[] } | { ok: false; error: string }> {
  const res = await call<{ sheets?: { properties?: { title?: string } }[] }>(
    `/${spreadsheetId}?fields=sheets(properties(title))`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    titles: (res.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t),
  };
}

/** Create a new tab at the end of the spreadsheet. */
export async function createTab(
  spreadsheetId: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await call(`/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Append one row below the last used row of a tab.
 *
 * RAW on purpose: dates are written as the clinic writes them ("12/08/2026"),
 * and USER_ENTERED would let Google reinterpret them in US month/day order.
 */
export async function appendRow(
  spreadsheetId: string,
  tabTitle: string,
  values: (string | number)[],
): Promise<{ ok: boolean; error?: string }> {
  const range = encodeURIComponent(`${tabTitle}!A:Z`);
  const res = await call(
    `/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [values] }) },
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
