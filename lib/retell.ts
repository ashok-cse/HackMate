import { participantVoiceMetadata, validE164Phone, type ParticipantVoiceMetaInput } from "@/lib/phone-voice-metadata";

/** Retell AI (https://www.retellai.com/) — phone API host for outbound calls. */
const RETELL_API = "https://api.retellai.com";

export type RetellDispatchResult =
  | {
      ok: true;
      callId: string;
      message?: string;
    }
  | {
      ok: false;
      reason: "not_configured" | "invalid_phone" | "request_failed";
      message: string;
      status?: number;
      detail?: string;
    };

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function retellApiKey(): string | undefined {
  return cleanEnv(process.env.RETELL_API_KEY);
}

function retellFromNumber(): string | undefined {
  return cleanEnv(process.env.RETELL_FROM_NUMBER);
}

/** Optional: force a specific agent when the from_number is not bound to one. */
function retellOverrideAgentId(): string | undefined {
  return cleanEnv(process.env.RETELL_AGENT_ID);
}

function mergedRetellLlmVariables(participant: ParticipantVoiceMetaInput): Record<string, string> {
  const base = participantVoiceMetadata(participant);
  const brief = cleanEnv(process.env.RETELL_LLM_CONTEXT);
  base.hackmate_brief = brief ? brief.slice(0, 12_000) : "";
  return base;
}

export function retellConfigured(): boolean {
  return Boolean(retellApiKey() && retellFromNumber());
}

export function validRetellPhone(phone: string): boolean {
  return validE164Phone(phone);
}

export async function dispatchRetellCall(
  participant: ParticipantVoiceMetaInput,
): Promise<RetellDispatchResult> {
  const apiKey = retellApiKey();
  const fromNumber = retellFromNumber();
  if (!apiKey || !fromNumber) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Set RETELL_API_KEY and RETELL_FROM_NUMBER to dispatch outbound calls.",
    };
  }

  const phoneNumber = participant.phone.trim();
  if (!validRetellPhone(phoneNumber)) {
    return {
      ok: false,
      reason: "invalid_phone",
      message: "Retell requires phone numbers in E.164 format, for example +491234567890.",
    };
  }

  const args = mergedRetellLlmVariables(participant);
  const metadata: Record<string, string> = { ...args };
  const agentOverride = retellOverrideAgentId();

  try {
    const res = await fetch(`${RETELL_API}/v2/create-phone-call`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: phoneNumber,
        metadata,
        retell_llm_dynamic_variables: args,
        ...(agentOverride ? { override_agent_id: agentOverride } : {}),
      }),
    });

    const text = await res.text();
    let data: { call_id?: string; message?: string } = {};
    if (text) {
      try {
        data = JSON.parse(text) as { call_id?: string; message?: string };
      } catch {
        data = { message: text };
      }
    }

    if (!res.ok || !data.call_id) {
      return {
        ok: false,
        reason: "request_failed",
        status: res.status,
        message: data.message ?? "Retell call dispatch failed.",
        detail: text || undefined,
      };
    }

    return {
      ok: true,
      callId: data.call_id,
      message: data.message,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "request_failed",
      message: error instanceof Error ? error.message : "Retell call dispatch failed.",
    };
  }
}
