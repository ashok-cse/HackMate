import { prisma } from "@/lib/prisma";
import { extractProfileFromTranscript } from "@/lib/extraction";
import { transcriptToText } from "@/lib/transcript";

export type IngestVoiceOpts = {
  participantId: string;
  transcript: unknown;
  provider: string;
  providerCallId?: string | null;
  status?: string;
  consentGiven?: boolean;
  recordingUrl?: string | null;
  durationSeconds?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  rawPayload?: object | null;
};

/** Shared extraction + profile upsert used by phone webhooks (SLNG / Retell) and browser voice submit. */
export async function extractAndStoreParticipantProfile(
  participantId: string,
  transcriptText: string,
  participantFullName: string,
) {
  if (!transcriptText.trim()) {
    await prisma.participant.update({
      where: { id: participantId },
      data: { profileStatus: "needs_manual_review" },
    });
    return { emptyTranscript: true as const };
  }

  const extracted = await extractProfileFromTranscript(transcriptText, participantFullName);
  extracted.participant_name = participantFullName;

  const profileStatus =
    extracted.confidence_score < 0.5 || extracted.missing_fields.length > 2
      ? "needs_manual_review"
      : "ready";

  await prisma.participantProfile.upsert({
    where: { participantId },
    create: {
      participantId,
      skills: extracted.skills,
      primaryRole: extracted.primary_role,
      strongestSkill: extracted.strongest_skill,
      experienceLevel: extracted.experience_level,
      projectIdea: extracted.project_idea,
      ideaSummary: extracted.idea_summary,
      domainInterests: extracted.domain_interests,
      wantsToLead: extracted.wants_to_lead,
      openToJoinOtherTeam: extracted.open_to_join_other_team,
      preferredTeamSize: extracted.preferred_team_size,
      neededTeammates: extracted.needed_teammates,
      availability: extracted.availability,
      existingTeamStatus: extracted.existing_team_status,
      confidenceScore: extracted.confidence_score,
      missingFields: extracted.missing_fields,
      extractionNotes: extracted.extraction_notes,
      rawExtraction: extracted as object,
    },
    update: {
      skills: extracted.skills,
      primaryRole: extracted.primary_role,
      strongestSkill: extracted.strongest_skill,
      experienceLevel: extracted.experience_level,
      projectIdea: extracted.project_idea,
      ideaSummary: extracted.idea_summary,
      domainInterests: extracted.domain_interests,
      wantsToLead: extracted.wants_to_lead,
      openToJoinOtherTeam: extracted.open_to_join_other_team,
      preferredTeamSize: extracted.preferred_team_size,
      neededTeammates: extracted.needed_teammates,
      availability: extracted.availability,
      existingTeamStatus: extracted.existing_team_status,
      confidenceScore: extracted.confidence_score,
      missingFields: extracted.missing_fields,
      extractionNotes: extracted.extraction_notes,
      rawExtraction: extracted as object,
    },
  });

  await prisma.participant.update({
    where: { id: participantId },
    data: { profileStatus },
  });

  return { profileStatus };
}

function normalizeCallStatus(status: string | undefined, consentGiven: boolean): string {
  const s = (status ?? "completed").toLowerCase();
  if (s.includes("no_answer")) return "no_answer";
  if (s.includes("fail")) return "failed";
  if (!consentGiven || s.includes("decline")) return "consent_declined";
  return "completed";
}

/**
 * Creates a Call row and runs the same profile extraction as phone call-ended webhooks.
 */
export async function ingestParticipantVoiceTranscript(opts: IngestVoiceOpts) {
  const participant = await prisma.participant.findUnique({ where: { id: opts.participantId } });
  if (!participant) {
    return { error: "participant_not_found" as const };
  }

  const transcriptText = transcriptToText(opts.transcript);
  const consentGiven = opts.consentGiven ?? participant.consentToCall;
  const callStatus = normalizeCallStatus(opts.status, consentGiven);

  const call = await prisma.call.create({
    data: {
      participantId: opts.participantId,
      provider: opts.provider,
      providerCallId: opts.providerCallId ?? null,
      status: opts.status ?? callStatus,
      transcript: (typeof opts.transcript === "object" ? opts.transcript : undefined) as object | undefined,
      transcriptText: transcriptText || null,
      recordingUrl: opts.recordingUrl ?? null,
      consentGiven,
      durationSeconds: opts.durationSeconds ?? null,
      startedAt: opts.startedAt ?? null,
      endedAt: opts.endedAt ?? null,
      rawPayload: opts.rawPayload ?? undefined,
    },
  });

  await prisma.participant.update({
    where: { id: opts.participantId },
    data: { callStatus },
  });

  if (!consentGiven || callStatus === "consent_declined") {
    return { ok: true as const, callId: call.id, skippedExtraction: true as const };
  }

  const empty = await extractAndStoreParticipantProfile(opts.participantId, transcriptText, participant.fullName);
  if ("emptyTranscript" in empty) {
    return { ok: true as const, callId: call.id, emptyTranscript: true as const };
  }

  return { ok: true as const, callId: call.id, profileStatus: empty.profileStatus };
}
