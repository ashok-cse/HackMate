import type { Event, Participant } from "@prisma/client";

/** Participant shape loaded for Retell outbound calls. */
export type ParticipantVoiceMetaInput = Pick<
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
  | "notes"
  | "consentToCall"
> & {
  event?: Pick<Event, "slug" | "title" | "description" | "locationSummary" | "startsAt" | "endsAt"> | null;
};

function truncateField(value: string | null | undefined, max = 1024): string {
  return (value ?? "").trim().slice(0, max);
}

/** E.164 — used by Retell AI outbound and phone webhooks. */
export function validE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

/**
 * Variables exposed to the Retell agent prompt (e.g. Welcome node).
 * `participant_id` is sent only in call `metadata` for webhooks, not here.
 */
export function retellLlmDynamicVariables(participant: ParticipantVoiceMetaInput): Record<string, string> {
  const ev = participant.event;
  const hackathonName = truncateField(participant.hackathonName) || truncateField(ev?.title);
  const name = truncateField(participant.fullName);
  const first = name.split(/\s+/).filter(Boolean)[0];
  const who = first ?? "there";
  const greetings = `Hi ${who}, thanks for picking up.`;
  const questions =
    "I'll ask a few short spoken questions for team matching, like a quick phone screen, starting with your background and strongest skills.";
  return {
    greetings,
    hackathon_name: hackathonName,
    questions,
  };
}
