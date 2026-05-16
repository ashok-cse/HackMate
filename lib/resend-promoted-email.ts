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
  const eventUrl = origin ? `${origin}/e/${encodeURIComponent(payload.eventSlug)}` : null;
  const firstName = payload.fullName.trim().split(/\s+/)[0] || payload.fullName.trim();

  const linkBlock = eventUrl
    ? `<p>Event page: <a href="${eventUrl}">${escapeHtml(eventUrl)}</a></p>`
    : "<p>You can use the same link you used to register for this event.</p>";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>You’ve been added to the <strong>participant</strong> list for <strong>${escapeHtml(payload.eventTitle)}</strong> on HackMate.</p>
  <p>Organizers may contact you for voice matching and team formation.</p>
  ${linkBlock}
  <p style="margin-top:1.5rem;color:#666;font-size:0.9em">— HackMate</p>
</body>
</html>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: `You're in: ${payload.eventTitle}`,
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
