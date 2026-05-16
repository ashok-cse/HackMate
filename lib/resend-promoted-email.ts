import { Resend } from "resend";
import { hackmateServerLog, truncateForStderrLog } from "@/lib/server-log";

function appOrigin(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return base;
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v}`;
  return undefined;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ParticipantPromotedEmail = {
  to: string;
  fullName: string;
  eventTitle: string;
  eventSlug: string;
  voiceInviteToken: string;
};

/**
 * Sends via Resend when RESEND_API_KEY and RESEND_FROM_EMAIL are set.
 * Never throws; logs API failures. Promotion / API handlers should not depend on delivery.
 */
export async function sendParticipantPromotedEmail(payload: ParticipantPromotedEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    hackmateServerLog("hackmate:resend", "skipped", {
      reason: !apiKey ? "RESEND_API_KEY unset" : "RESEND_FROM_EMAIL unset",
    });
    return;
  }

  const origin = appOrigin();
  const path = `/e/${encodeURIComponent(payload.eventSlug)}/voice/${encodeURIComponent(payload.voiceInviteToken)}`;
  const voiceUrl = origin ? `${origin}${path}` : null;

  const firstName = payload.fullName.trim().split(/\s+/)[0] || payload.fullName.trim();

  const ctaBlock = voiceUrl
    ? `<p style="margin:1.25rem 0"><a href="${voiceUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Complete voice assessment</a></p>
       <p style="font-size:0.9em;color:#444">Or open this link: <a href="${voiceUrl}">${escapeHtml(voiceUrl)}</a></p>`
    : `<p>Complete your voice assessment at: <code style="background:#f4f4f5;padding:2px 6px;border-radius:4px">${escapeHtml(path)}</code></p>
       <p style="font-size:0.9em;color:#444">Set <strong>NEXT_PUBLIC_APP_URL</strong> in HackMate so the button works in email.</p>`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>You’ve been added to the <strong>participant</strong> list for <strong>${escapeHtml(payload.eventTitle)}</strong>.</p>
  <p>Please complete a short <strong>voice assessment</strong> in your browser (or type your answers). We use the same pipeline as phone-based screenings to extract skills and team-fit for matching.</p>
  ${ctaBlock}
  <p style="margin-top:1.25rem;color:#666;font-size:0.9em">— HackMate</p>
</body>
</html>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: `Voice assessment — ${payload.eventTitle}`,
      html,
    });
    if (error) {
      hackmateServerLog(
        "hackmate:resend",
        "api_error",
        { error: truncateForStderrLog(JSON.stringify(error)), to: payload.to },
        "warn",
      );
    }
  } catch (e) {
    hackmateServerLog(
      "hackmate:resend",
      "send_failed",
      { err: truncateForStderrLog(String(e)), to: payload.to },
      "error",
    );
  }
}
