import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureParticipantFromRegistration } from "@/lib/ensure-participant-from-registration";
import { ingestParticipantVoiceTranscript } from "@/lib/participant-voice-ingest";

const MAX_TRANSCRIPT = 48_000;
const MIN_TRANSCRIPT = 12;

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.registrationOpen) {
    return NextResponse.json({ error: "Registration is closed" }, { status: 403 });
  }

  const body = (await req.json()) as { registrationId?: string; transcript?: string };
  const registrationId = body.registrationId?.trim();
  const transcript = body.transcript?.trim() ?? "";

  if (!registrationId) {
    return NextResponse.json({ error: "registrationId is required" }, { status: 400 });
  }
  if (transcript.length < MIN_TRANSCRIPT) {
    return NextResponse.json(
      { error: `Transcript too short (min ${MIN_TRANSCRIPT} characters)` },
      { status: 400 },
    );
  }
  if (transcript.length > MAX_TRANSCRIPT) {
    return NextResponse.json({ error: "Transcript too long" }, { status: 400 });
  }

  const ensured = await ensureParticipantFromRegistration(registrationId, slug);
  if ("error" in ensured) {
    const map = {
      registration_not_found: { status: 404, message: "Registration not found" },
      event_mismatch: { status: 400, message: "Invalid registration for this event" },
      no_consent: { status: 403, message: "Registration did not include contact consent" },
      email_conflict: {
        status: 409,
        message:
          "This email is already in the system for another event. Ask organizers to link your registration.",
      },
    } as const;
    const code = ensured.error as keyof typeof map;
    const e = map[code] ?? { status: 400 as const, message: "Could not prepare participant" };
    return NextResponse.json({ error: e.message }, { status: e.status });
  }

  const transcriptMessages = [{ role: "user", text: transcript }];
  const result = await ingestParticipantVoiceTranscript({
    participantId: ensured.participantId,
    transcript: transcriptMessages,
    provider: "web",
    consentGiven: true,
    rawPayload: { source: "browser_voice", submittedAt: new Date().toISOString() },
  });

  if ("error" in result) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    callId: result.callId,
    profileStatus: "profileStatus" in result ? result.profileStatus : undefined,
    skippedExtraction: "skippedExtraction" in result ? result.skippedExtraction : false,
    emptyTranscript: "emptyTranscript" in result ? result.emptyTranscript : false,
    message: "Thanks — your voice profile was saved and processed like a phone interview.",
  });
}
