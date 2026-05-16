import crypto from "node:crypto";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    return aBuf.length === bBuf.length && aBuf.length > 0 && crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Retell webhook signature: X-Retell-Signature = v={ms},d={hex}
 * HMAC-SHA256(rawBody + timestamp, api_key) === d
 * @see https://docs.retellai.com/features/secure-webhook
 */
export function verifyRetellWebhookSignature(
  rawBody: string,
  apiKey: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !apiKey) return false;
  const m = /^v=(\d+),d=(.*)$/.exec(signatureHeader.trim());
  if (!m) return false;
  const timestamp = m[1];
  const digest = m[2];
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Date.now();
  if (Math.abs(now - ts) > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody + timestamp).digest("hex");
  return timingSafeEqualHex(expected, digest);
}
