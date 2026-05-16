import { NextResponse } from "next/server";
import { groqAgentReply, groqConfigured, openingBootstrapMessage } from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";
import { hackmateServerLog, truncateForStderrLog } from "@/lib/server-log";

export const runtime = "nodejs";
/** Chat-only handshake; TTS is POST /agent/tts (smaller requests, fewer proxy timeouts). */
export const maxDuration = 90;

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
    return NextResponse.json({ text });
  } catch (e) {
    hackmateServerLog(
      "hackmate:voice-opening",
      "groq_failed",
      { err: truncateForStderrLog(e instanceof Error ? e.message : String(e)) },
      "error",
    );
    return NextResponse.json({ error: "Could not start voice agent" }, { status: 502 });
  }
}
