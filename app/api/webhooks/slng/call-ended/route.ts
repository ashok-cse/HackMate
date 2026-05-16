import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { extractProfileFromTranscript } from "@/lib/extraction";
import { transcriptToText } from "@/lib/transcript";

type Payload = {
  arguments?: Record<string, unknown>;
  tool_arguments?: Record<string, unknown>;
  data?: Record<string, unknown>;
  call_id?: string;
  call_end_reason?: string;
  slng_call_id?: string;
  participant_id?: string;
  status?: string;
  transcript?: unknown;
  recording_url?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  consent_given?: boolean;
};

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  return timingSafeEqual(provided, digest);
}

function nested(payload: Payload): Record<string, unknown> {
  return payload.arguments ?? payload.tool_arguments ?? payload.data ?? {};
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFrom(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(v)) return true;
  if (["false", "0", "no"].includes(v)) return false;
  return undefined;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = process.env.SLNG_WEBHOOK_SECRET;
  if (secret) {
    const sharedSecret = req.headers.get("x-slng-signature") ?? req.headers.get("x-webhook-secret");
    const hmac = req.headers.get("x-signature-256");
    const directMatch = sharedSecret ? timingSafeEqual(sharedSecret, secret) : false;
    if (!directMatch && !verifyHmac(rawBody, hmac, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Payload;
  try {
    payload = JSON.parse(rawBody) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const args = nested(payload);
  const participantId = stringFrom(payload.participant_id) ?? stringFrom(args.participant_id);
  if (!participantId) {
    return NextResponse.json({ error: "participant_id required" }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "participant not found" }, { status: 404 });
  }

  const transcript = payload.transcript ?? args.transcript;
  const transcriptText = transcriptToText(transcript);
  const status = (
    stringFrom(payload.status) ??
    stringFrom(args.status) ??
    stringFrom(payload.call_end_reason) ??
    stringFrom(args.call_end_reason) ??
    "completed"
  ).toLowerCase();
  const consentGiven =
    booleanFrom(payload.consent_given) ??
    booleanFrom(args.consent_given) ??
    (!status.includes("decline") && participant.consentToCall);

  let callStatus = "completed";
  if (status.includes("no_answer")) callStatus = "no_answer";
  else if (status.includes("fail")) callStatus = "failed";
  else if (!consentGiven) callStatus = "consent_declined";

  const providerCallId =
    stringFrom(payload.slng_call_id) ?? stringFrom(args.slng_call_id) ?? stringFrom(payload.call_id);

  const callData = {
    participantId,
    provider: "slng",
    providerCallId: providerCallId ?? null,
    status,
    transcript: transcript as object | undefined,
    transcriptText: transcriptText || null,
    recordingUrl: payload.recording_url ?? null,
    consentGiven,
    durationSeconds: payload.duration_seconds ?? null,
    startedAt: payload.started_at ? new Date(payload.started_at) : null,
    endedAt: payload.ended_at ? new Date(payload.ended_at) : null,
    rawPayload: payload as object,
  };

  const existingCall = providerCallId
    ? await prisma.call.findFirst({
        where: { participantId, providerCallId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const call = existingCall
    ? await prisma.call.update({
        where: { id: existingCall.id },
        data: callData,
      })
    : await prisma.call.create({ data: callData });

  await prisma.participant.update({
    where: { id: participantId },
    data: { callStatus },
  });

  if (!consentGiven || callStatus === "consent_declined") {
    return NextResponse.json({ ok: true, callId: call.id, skippedExtraction: true });
  }

  if (!transcriptText.trim()) {
    await prisma.participant.update({
      where: { id: participantId },
      data: { profileStatus: "needs_manual_review" },
    });
    return NextResponse.json({ ok: true, callId: call.id, emptyTranscript: true });
  }

  const extracted = await extractProfileFromTranscript(transcriptText, participant.fullName);
  extracted.participant_name = participant.fullName;

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

  return NextResponse.json({ ok: true, callId: call.id, profileStatus });
}
