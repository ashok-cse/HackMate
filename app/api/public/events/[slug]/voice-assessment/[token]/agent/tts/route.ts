import { NextResponse } from "next/server";
import { groqConfigured, groqSpeech } from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";

export const runtime = "nodejs";
export const maxDuration = 90;

function stripCompleteTokenForSpeech(text: string): string {
  const t = text.trimEnd();
  const lines = t.split(/\r?\n/);
  const last = lines[lines.length - 1]?.trim() ?? "";
  const out =
    /^ASSESSMENT_COMPLETE$/i.test(last) && lines.length > 0
      ? lines.slice(0, -1).join("\n").trim()
      : text.trim();
  return out.slice(0, 4000);
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (!groqConfigured()) {
    return NextResponse.json({ error: "Voice agent is not configured." }, { status: 503 });
  }

  const body = (await req.json()) as { text?: string };
  const raw = typeof body.text === "string" ? body.text : "";
  const spoken = stripCompleteTokenForSpeech(raw);
  if (!spoken) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await groqSpeech(spoken);
    return NextResponse.json({
      audioBase64: buffer.toString("base64"),
      mimeType: contentType,
    });
  } catch {
    return NextResponse.json({ error: "TTS failed" }, { status: 502 });
  }
}
