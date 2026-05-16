import { NextResponse } from "next/server";
import { groqConfigured, groqTranscribe } from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (!groqConfigured()) {
    return NextResponse.json({ error: "Voice agent is not configured." }, { status: 503 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("audio") ?? form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file field" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 400 });
  }
  if (file.size < 256) {
    return NextResponse.json({ error: "Audio too short" }, { status: 400 });
  }

  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);
  const name = file instanceof File && file.name ? file.name : "recording.webm";

  try {
    const text = await groqTranscribe(buffer, name.endsWith(".") ? "recording.webm" : name);
    if (!text) {
      return NextResponse.json({ error: "No speech detected" }, { status: 400 });
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
}
