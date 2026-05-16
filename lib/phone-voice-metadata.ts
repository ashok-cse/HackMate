import type { Event, Participant } from "@prisma/client";

/** Fields loaded for Retell `metadata` / `retell_llm_dynamic_variables`. */
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

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

/** E.164 — used by Retell AI outbound and phone webhooks. */
export function validE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

/**
 * Metadata / dynamic variables forwarded to Retell on outbound dial.
 * Keys are stable so prompts can always reference e.g. {{city}} (may be empty).
 */
export function participantVoiceMetadata(participant: ParticipantVoiceMetaInput): Record<string, string> {
  const ev = participant.event;
  return {
    participant_id: participant.id.trim(),
    external_registration_id: truncateField(participant.externalRegistrationId),
    full_name: truncateField(participant.fullName),
    email: truncateField(participant.email),
    phone: truncateField(participant.phone),
    city: truncateField(participant.city),
    hackathon_name: truncateField(participant.hackathonName),
    university_or_company: truncateField(participant.universityOrCompany),
    registration_type: truncateField(participant.registrationType),
    known_skills: truncateField(participant.knownSkills),
    existing_team_name: truncateField(participant.existingTeamName),
    notes: truncateField(participant.notes),
    consent_to_call: participant.consentToCall ? "true" : "false",
    event_slug: truncateField(ev?.slug),
    event_title: truncateField(ev?.title),
    event_description: truncateField(ev?.description),
    event_location_summary: truncateField(ev?.locationSummary),
    event_starts_at: iso(ev?.startsAt ?? undefined),
    event_ends_at: iso(ev?.endsAt ?? undefined),
  };
}
