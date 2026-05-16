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

/** Same shape as retell-sdk `symmetric.verify` header parse: v=(\\d+),d=(.*) */
function parseRetellSignatureHeader(
  signatureHeader: string,
): { tsMs: number; digest: string } | null {
  const m = /^v=(\d+)\s*,\s*d=\s*(.*)$/i.exec(signatureHeader.trim());
  if (!m) return null;
  const tsMs = Number.parseInt(m[1]!, 10);
  const digest = m[2]!.trim().replace(/\s+/g, "");
  if (
    !Number.isFinite(tsMs) ||
    !/^[0-9a-fA-F]+$/.test(digest) ||
    digest.length === 0 ||
    digest.length % 2 !== 0
  ) {
    return null;
  }
  return { tsMs, digest };
}

export type RetellWebhookSigIssue = "malformed" | "timestamp_skew" | "digest_mismatch";

/**
 * Retell webhook signature: X-Retell-Signature = v={timestamp_ms},d={hex}
 * HMAC-SHA256(rawBody + timestamp_ms as number, api_key) — see retell-sdk `symmetric.sign`.
 * @see https://docs.retellai.com/features/secure-webhook
 */
export function verifyRetellWebhookSignature(
  rawBody: string,
  apiKey: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !apiKey) return false;
  const parsed = parseRetellSignatureHeader(signatureHeader);
  if (!parsed) return false;
  const now = Date.now();
  if (Math.abs(now - parsed.tsMs) > retellWebhookAllowedSkewMs()) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody + parsed.tsMs)
    .digest("hex");
  return timingSafeEqualHex(expected, parsed.digest);
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

export function verifyRetellWebhookSignatureAnyDetailed(
  rawBody: string,
  apiKeys: readonly string[],
  signatureHeader: string | null,
): { ok: true } | { ok: false; issue: RetellWebhookSigIssue } {
  if (!signatureHeader?.trim()) return { ok: false, issue: "malformed" };
  const parsed = parseRetellSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, issue: "malformed" };
  const now = Date.now();
  if (Math.abs(now - parsed.tsMs) > retellWebhookAllowedSkewMs()) {
    return { ok: false, issue: "timestamp_skew" };
  }
  const keys = [...new Set(apiKeys.map((k) => k.trim()).filter(Boolean))];
  for (const apiKey of keys) {
    const expected = crypto
      .createHmac("sha256", apiKey)
      .update(rawBody + parsed.tsMs)
      .digest("hex");
    if (timingSafeEqualHex(expected, parsed.digest)) return { ok: true };
  }
  return { ok: false, issue: "digest_mismatch" };
}
