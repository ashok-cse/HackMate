import crypto from "node:crypto";

const DEFAULT_SKEW_MS = 5 * 60 * 1000;

function timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
  try {
    const a = Buffer.from(expectedHex.toLowerCase(), "hex");
    const b = Buffer.from(receivedHex.toLowerCase(), "hex");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Clock skew window (docs: 5 minutes). Override with RETELL_WEBHOOK_TS_SKEW_MS=60000–3600000. */
export function retellWebhookAllowedSkewMs(): number {
  const raw = process.env.RETELL_WEBHOOK_TS_SKEW_MS?.trim();
  if (!raw) return DEFAULT_SKEW_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 60_000 && n <= 60 * 60 * 1000 ? n : DEFAULT_SKEW_MS;
}

/**
 * Retell webhook signature: X-Retell-Signature = v={timestamp_ms},d={hex}
 * HMAC-SHA256(rawBody + timestamp_string, api_key) hex === d
 * @see https://docs.retellai.com/features/secure-webhook
 * @see https://github.com/RetellAI/retell-typescript-sdk/blob/main/src/lib/webhook_auth.ts
 */
export function verifyRetellWebhookSignature(
  rawBody: string,
  apiKey: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !apiKey) return false;
  const trimmed = signatureHeader.trim();
  const m = /^v=(\d+)\s*,\s*d=\s*([0-9a-fA-F]+)\s*$/i.exec(trimmed);
  if (!m) return false;
  const timestamp = m[1]!;
  const digest = m[2]!.trim();
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Date.now();
  if (Math.abs(now - ts) > retellWebhookAllowedSkewMs()) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody + timestamp).digest("hex");
  return timingSafeEqualHex(expected, digest);
}

/** Try each secret until one verifies (webhook-badge key vs generic API key). */
export function verifyRetellWebhookSignatureAny(
  rawBody: string,
  apiKeys: readonly string[],
  signatureHeader: string | null,
): boolean {
  const keys = [...new Set(apiKeys.map((k) => k.trim()).filter(Boolean))];
  return keys.some((k) => verifyRetellWebhookSignature(rawBody, k, signatureHeader));
}
