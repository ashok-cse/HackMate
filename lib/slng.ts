import type { Participant } from "@prisma/client";

const DEFAULT_SLNG_API_BASE = "https://api.agents.slng.ai";

export type SlngDispatchResult =
  | {
      ok: true;
      apiBase: string;
      callId: string;
      message?: string;
    }
  | {
      ok: false;
      apiBase?: string;
      reason: "not_configured" | "invalid_phone" | "request_failed";
      message: string;
      status?: number;
      detail?: string;
    };

type SlngCallResponse = {
  call_id?: string;
  message?: string;
};

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

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function slngAgentId(): string | undefined {
  return cleanEnv(process.env.SLNG_AGENT_ID);
}

function slngApiKey(): string | undefined {
  return cleanEnv(process.env.SLNG_API_KEY);
}

function slngApiBase(): string {
  return (cleanEnv(process.env.SLNG_API_BASE) ?? DEFAULT_SLNG_API_BASE).replace(/\/+$/, "");
}

export function slngConfigured(): boolean {
  return Boolean(slngAgentId() && slngApiKey());
}

export function validSlngPhone(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

function arg(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 1024);
}

export function participantSlngArguments(participant: CallParticipant): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      participant_id: participant.id,
      external_registration_id: participant.externalRegistrationId,
      full_name: participant.fullName,
      email: participant.email,
      city: participant.city,
      hackathon_name: participant.hackathonName,
      university_or_company: participant.universityOrCompany,
      registration_type: participant.registrationType,
      known_skills: participant.knownSkills,
      existing_team_name: participant.existingTeamName,
    }).flatMap(([key, value]) => {
      const cleaned = arg(value);
      return cleaned ? [[key, cleaned]] : [];
    }),
  );
}

export async function dispatchSlngCall(
  participant: CallParticipant,
): Promise<SlngDispatchResult> {
  const agentId = slngAgentId();
  const apiKey = slngApiKey();
  if (!agentId || !apiKey) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Set SLNG_API_KEY and SLNG_AGENT_ID to dispatch outbound calls.",
    };
  }

  const phoneNumber = participant.phone.trim();
  if (!validSlngPhone(phoneNumber)) {
    return {
      ok: false,
      reason: "invalid_phone",
      message: "SLNG requires phone numbers in E.164 format, for example +491234567890.",
    };
  }

  const apiBase = slngApiBase();
  try {
    const res = await fetch(`${apiBase}/v1/agents/${encodeURIComponent(agentId)}/calls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phoneNumber,
        arguments: participantSlngArguments(participant),
      }),
    });

    const text = await res.text();
    let data: SlngCallResponse = {};
    if (text) {
      try {
        data = JSON.parse(text) as SlngCallResponse;
      } catch {
        data = { message: text };
      }
    }

    if (!res.ok || !data.call_id) {
      return {
        ok: false,
        apiBase,
        reason: "request_failed",
        status: res.status,
        message: data.message ?? "SLNG call dispatch failed.",
        detail: text || undefined,
      };
    }

    return {
      ok: true,
      apiBase,
      callId: data.call_id,
      message: data.message,
    };
  } catch (error) {
    return {
      ok: false,
      apiBase,
      reason: "request_failed",
      message: error instanceof Error ? error.message : "SLNG call dispatch failed.",
    };
  }
}
