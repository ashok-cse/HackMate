import type { Participant } from "@prisma/client";
import { dispatchRetellCall, retellConfigured } from "@/lib/retell";
import { dispatchSlngCall, slngConfigured } from "@/lib/slng";

type CallParticipant = Pick<
  Participant,
  | "id"
  | "externalRegistrationId"
  | "fullName"
  | "email"
  | "phone"
  | "city"
  | "hackathonName"
  | "universityOrCompany"
  | "registrationType"
  | "knownSkills"
  | "existingTeamName"
>;

export type OutboundPhoneProvider = "retell" | "slng";

export type OutboundPhoneDispatchResult =
  | {
      ok: true;
      provider: OutboundPhoneProvider;
      callId: string;
      message?: string;
      apiBase?: string;
    }
  | {
      ok: false;
      provider?: OutboundPhoneProvider;
      reason: "not_configured" | "invalid_phone" | "request_failed";
      message: string;
      status?: number;
      detail?: string;
      apiBase?: string;
    };

function mode(): "auto" | "retell" | "slng" {
  const m = (process.env.PHONE_VOICE_PROVIDER ?? "auto").trim().toLowerCase();
  if (m === "retell" || m === "slng") return m;
  return "auto";
}

/** Which provider will be used for the next outbound dial (null if none configured for current mode). */
export function outboundPhoneProvider(): OutboundPhoneProvider | null {
  const md = mode();
  if (md === "retell") return retellConfigured() ? "retell" : null;
  if (md === "slng") return slngConfigured() ? "slng" : null;
  if (retellConfigured()) return "retell";
  if (slngConfigured()) return "slng";
  return null;
}

export function outboundPhoneConfigured(): boolean {
  return outboundPhoneProvider() !== null;
}

export async function dispatchOutboundPhone(
  participant: CallParticipant,
): Promise<OutboundPhoneDispatchResult> {
  const provider = outboundPhoneProvider();
  if (!provider) {
    const md = mode();
    const hint =
      md === "retell"
        ? "Set RETELL_API_KEY and RETELL_FROM_NUMBER."
        : md === "slng"
          ? "Set SLNG_API_KEY and SLNG_AGENT_ID."
          : "Set Retell (RETELL_API_KEY, RETELL_FROM_NUMBER) or SLNG (SLNG_API_KEY, SLNG_AGENT_ID), or set PHONE_VOICE_PROVIDER.";
    return {
      ok: false,
      reason: "not_configured",
      message: `No phone provider configured. ${hint}`,
    };
  }

  if (provider === "retell") {
    const r = await dispatchRetellCall(participant);
    if (r.ok) {
      return { ok: true, provider: "retell", callId: r.callId, message: r.message };
    }
    return {
      ok: false,
      provider: "retell",
      reason: r.reason,
      message: r.message,
      status: r.ok ? undefined : r.status,
      detail: r.ok ? undefined : r.detail,
    };
  }

  const r = await dispatchSlngCall(participant);
  if (r.ok) {
    return {
      ok: true,
      provider: "slng",
      callId: r.callId,
      message: r.message,
      apiBase: r.apiBase,
    };
  }
  return {
    ok: false,
    provider: "slng",
    reason: r.reason,
    message: r.message,
    status: r.status,
    detail: r.detail,
    apiBase: r.apiBase,
  };
}
