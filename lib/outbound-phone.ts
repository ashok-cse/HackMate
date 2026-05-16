import { dispatchRetellCall, retellConfigured } from "@/lib/retell";
import type { ParticipantVoiceMetaInput } from "@/lib/phone-voice-metadata";

export type OutboundPhoneProvider = "retell";

export type OutboundPhoneDispatchResult =
  | {
      ok: true;
      provider: OutboundPhoneProvider;
      callId: string;
      message?: string;
    }
  | {
      ok: false;
      provider?: OutboundPhoneProvider;
      reason: "not_configured" | "invalid_phone" | "request_failed";
      message: string;
      status?: number;
      detail?: string;
    };

/** Phone outbound uses Retell AI only (`RETELL_API_KEY`, `RETELL_FROM_NUMBER`). */
export function outboundPhoneProvider(): OutboundPhoneProvider | null {
  return retellConfigured() ? "retell" : null;
}

export function outboundPhoneConfigured(): boolean {
  return retellConfigured();
}

export async function dispatchOutboundPhone(
  participant: ParticipantVoiceMetaInput,
): Promise<OutboundPhoneDispatchResult> {
  if (!retellConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "No phone provider configured. Set RETELL_API_KEY and RETELL_FROM_NUMBER for Retell AI outbound calls.",
    };
  }

  const r = await dispatchRetellCall(participant);
  if (r.ok) {
    return { ok: true, provider: "retell", callId: r.callId, message: r.message };
  }
  return {
    ok: false,
    provider: "retell",
    reason: r.reason,
    message: r.message,
    status: r.status,
    detail: r.detail,
  };
}
