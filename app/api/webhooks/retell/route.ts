import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractAndStoreParticipantProfile } from "@/lib/participant-voice-ingest";
import { verifyRetellWebhookSignature } from "@/lib/retell-webhook-verify";
import { transcriptToText } from "@/lib/transcript";

export const runtime = "nodejs";

type RetellCallPayload = {
  call_id?: string;
  call_status?: string;
  disconnection_reason?: string;
  transcript?: unknown;
  transcript_object?: unknown;
  recording_url?: string;
  metadata?: Record<string, unknown>;
  start_timestamp?: number;
  end_timestamp?: number;
  /** May appear on some payloads */
  retell_llm_dynamic_variables?: Record<string, unknown>;
};

type WebhookBody = {
  event?: string;
  call?: RetellCallPayload;
};

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

function participantIdFromCall(call: RetellCallPayload): string | undefined {
  const meta = call.metadata ?? {};
  const fromMeta =
    stringFrom(meta.participant_id) ??
    stringFrom(meta["participant_id"]) ??
    stringFrom((meta as { participantId?: string }).participantId);
  if (fromMeta) return fromMeta;
  const dyn = call.retell_llm_dynamic_variables ?? {};
  return stringFrom(dyn.participant_id);
}

/** Lets Retell / browser “test URL” pings succeed (POST-only routes often 404 on GET). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    path: "/api/webhooks/retell",
    hint: "Configure Retell (retell.ai) webhooks as POST call_ended to this URL.",
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const apiKey = process.env.RETELL_API_KEY?.trim();
  if (apiKey) {
    const sig = req.headers.get("x-retell-signature");
    if (!verifyRetellWebhookSignature(rawBody, apiKey, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event;
  if (event !== "call_ended") {
    return new NextResponse(null, { status: 204 });
  }

  const call = body.call;
  if (!call) {
    return NextResponse.json({ error: "call required" }, { status: 400 });
  }

  const participantId = participantIdFromCall(call);
  if (!participantId) {
    return NextResponse.json(
      { error: "participant_id missing from call metadata or dynamic variables" },
      { status: 400 },
    );
  }

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "participant not found" }, { status: 404 });
  }

  const transcript = call.transcript_object ?? call.transcript;
  const transcriptText = transcriptToText(transcript);
  const disc = (call.disconnection_reason ?? "").toLowerCase();
  const status = disc || (call.call_status ?? "ended").toLowerCase();

  const consentGiven =
    booleanFrom(call.metadata?.consent_given) ??
    booleanFrom((call.retell_llm_dynamic_variables as Record<string, unknown> | undefined)?.consent_given) ??
    (!status.includes("decline") && participant.consentToCall);

  let callStatus = "completed";
  if (status.includes("no_answer") || disc.includes("dial_no_answer")) callStatus = "no_answer";
  else if (
    status.includes("fail") ||
    disc.includes("dial_failed") ||
    disc.includes("error") ||
    call.call_status === "error"
  )
    callStatus = "failed";
  else if (!consentGiven) callStatus = "consent_declined";

  const providerCallId = stringFrom(call.call_id);
  let durationSeconds: number | null = null;
  if (
    typeof call.start_timestamp === "number" &&
    typeof call.end_timestamp === "number" &&
    call.end_timestamp >= call.start_timestamp
  ) {
    durationSeconds = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  }

  const callData = {
    participantId,
    provider: "retell",
    providerCallId: providerCallId ?? null,
    status,
    transcript: (typeof transcript === "object" ? transcript : undefined) as object | undefined,
    transcriptText: transcriptText || null,
    recordingUrl: stringFrom(call.recording_url) ?? null,
    consentGiven,
    durationSeconds,
    startedAt:
      typeof call.start_timestamp === "number" ? new Date(call.start_timestamp) : null,
    endedAt: typeof call.end_timestamp === "number" ? new Date(call.end_timestamp) : null,
    rawPayload: body as object,
  };

  const existingCall = providerCallId
    ? await prisma.call.findFirst({
        where: { participantId, provider: "retell", providerCallId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const row = existingCall
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
    return new NextResponse(null, { status: 204 });
  }

  if (!transcriptText.trim()) {
    await prisma.participant.update({
      where: { id: participantId },
      data: { profileStatus: "needs_manual_review" },
    });
    return new NextResponse(null, { status: 204 });
  }

  const extractResult = await extractAndStoreParticipantProfile(
    participantId,
    transcriptText,
    participant.fullName,
  );
  if ("emptyTranscript" in extractResult) {
    await prisma.participant.update({
      where: { id: participantId },
      data: { profileStatus: "needs_manual_review" },
    });
  }

  return new NextResponse(null, { status: 204 });
}
