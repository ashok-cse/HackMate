import { NextResponse } from "next/server";
import { ingestParticipantVoiceTranscript } from "@/lib/participant-voice-ingest";
import { groqConfigured } from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";

const MAX_TRANSCRIPT = 48_000;
const MIN_TRANSCRIPT = 12;

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    eventTitle: participant.event!.title,
    voiceAgentAvailable: groqConfigured(),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const body = (await req.json()) as { transcript?: string };
  const transcript = body.transcript?.trim() ?? "";

  if (transcript.length < MIN_TRANSCRIPT) {
    return NextResponse.json(
      { error: `Transcript too short (min ${MIN_TRANSCRIPT} characters)` },
      { status: 400 },
    );
  }
  if (transcript.length > MAX_TRANSCRIPT) {
    return NextResponse.json({ error: "Transcript too long" }, { status: 400 });
  }

  const transcriptMessages = [{ role: "user", text: transcript }];
  const result = await ingestParticipantVoiceTranscript({
    participantId: participant.id,
    transcript: transcriptMessages,
    provider: "web",
    consentGiven: true,
    rawPayload: {
      source: "voice_assessment_page",
      submittedAt: new Date().toISOString(),
    },
  });

  if ("error" in result) {
    return NextResponse.json({ error: "Could not save profile" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    callId: result.callId,
    profileStatus: "profileStatus" in result ? result.profileStatus : undefined,
    skippedExtraction: "skippedExtraction" in result ? result.skippedExtraction : false,
    emptyTranscript: "emptyTranscript" in result ? result.emptyTranscript : false,
    message:
      "Thanks — your voice assessment was saved. We’ll use it for team matching along with our other screening channels.",
  });
}
