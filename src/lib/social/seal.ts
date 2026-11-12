// The connected accounts' tokens are stored sealed (AES-256-GCM), so the
// database alone — a backup, the SQL editor, a read-only query — never shows a
// token that can post as the clinic's Facebook page or TikTok account. The key
// is derived from META_APP_SECRET, which lives only in the server's env.
import crypto from "node:crypto";

function key(): Buffer {
  const secret = process.env.CHANNEL_TOKEN_KEY || process.env.META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET is not set — cannot seal channel tokens");
  return crypto.createHash("sha256").update(`hijraa-crm:channel-tokens:${secret}`).digest();
}

/** "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The token back; throws when the value was tampered with or the key changed. */
export function unseal(sealed: string): string {
  const [v, iv, tag, body] = String(sealed).split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("not a sealed token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/* The connect links carry a signed `state`: who started it, for which clinic,
   and until when — so a callback nobody here started is refused. */
function mac(payload: string): string {
  return crypto.createHmac("sha256", key()).update(`state:${payload}`).digest("base64url");
}
export function signState(data: Record<string, string>, ttlSeconds = 900): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}
export function readState(state: string | null | undefined): Record<string, string> | null {
  const [payload, sig] = String(state ?? "").split(".");
  if (!payload || !sig) return null;
  const want = mac(payload);
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}
