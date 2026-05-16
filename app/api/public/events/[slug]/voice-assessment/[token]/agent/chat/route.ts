import { NextResponse } from "next/server";
import { groqAgentReply, groqConfigured } from "@/lib/groq-voice";
import { participantForVoiceLink } from "@/lib/voice-assessment-token";

export const runtime = "nodejs";

type Msg = { role: string; content: string };

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  const participant = await participantForVoiceLink(slug, token);
  if (!participant) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (!groqConfigured()) {
    return NextResponse.json({ error: "Voice agent is not configured." }, { status: 503 });
  }

  const body = (await req.json()) as { messages?: Msg[] };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 1) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
  }

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (typeof m.content !== "string" || m.content.length > 16_000) {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }
  }

  try {
    const history = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const text = await groqAgentReply(history);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "Assistant failed" }, { status: 502 });
  }
}
