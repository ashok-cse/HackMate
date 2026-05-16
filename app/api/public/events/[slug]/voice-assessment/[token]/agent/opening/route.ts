import { NextResponse } from "next/server";
import {
  groqAgentReply,
  groqConfigured,
  groqSpeech,
  openingBootstrapMessage,
} from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";

export const runtime = "nodejs";

function stripCompleteTokenForSpeech(text: string): string {
  return text
    .replace(/\s*ASSESSMENT_COMPLETE\s*$/im, "")
    .trim()
    .slice(0, 4000);
}

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (!groqConfigured()) {
    return NextResponse.json({ error: "Voice agent is not configured (GROQ_API_KEY)." }, { status: 503 });
  }

  try {
    const history = [openingBootstrapMessage(participant.event!.title)];
    const text = await groqAgentReply(history);
    const spoken = stripCompleteTokenForSpeech(text);
    const { buffer, contentType } = await groqSpeech(spoken || text);
    return NextResponse.json({
      text,
      audioBase64: buffer.toString("base64"),
      mimeType: contentType,
    });
  } catch {
    return NextResponse.json({ error: "Could not start voice agent" }, { status: 502 });
  }
}
