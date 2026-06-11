import crypto from "node:crypto";

/**
 * Verify the X-Hub-Signature-256 header Meta sends with each webhook POST.
 * Proves the request genuinely came from Meta (signed with your app secret).
 * Returns true if valid OR if no app secret is configured (dev convenience).
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.META_APP_SECRET;
  // In local dev without an app secret yet, don't block — but warn.
  if (!appSecret) {
    console.warn(
      "[whatsapp] META_APP_SECRET not set — skipping signature verification.",
    );
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  // Constant-time compare to avoid timing attacks.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
