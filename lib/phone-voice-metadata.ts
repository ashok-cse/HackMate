import type { Participant } from "@prisma/client";

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

function arg(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 1024);
}

/** E.164 — used by Retell AI outbound and phone webhooks. */
export function validE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

/** Metadata / dynamic variables forwarded to Retell on outbound dial. */
export function participantVoiceMetadata(participant: CallParticipant): Record<string, string> {
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
