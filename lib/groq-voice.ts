import { hackmateServerLog } from "@/lib/server-log";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function apiKey(): string {
  const k = process.env.GROQ_API_KEY?.trim();
  if (!k) throw new Error("GROQ_API_KEY is not set");
  return k;
}

export const VOICE_AGENT_SYSTEM_PROMPT = `You are a friendly, concise voice interviewer for a hackathon team-matching service (HackMate). You speak in short sentences—this will be read aloud with text-to-speech.

Rules:
- Ask ONE clear question at a time. Wait for the candidate's answer before the next question.
- Cover naturally over the conversation: technical skills, experience level, whether they want to lead or join, preferred team size, any project idea, availability, and existing team status if any.
- Be encouraging; no jargon about "API" or "models".
- Keep each reply under 120 words. Use plain spoken English.
- When you have enough to match them (skills + role preference + team intent + at least a rough idea or "no idea yet"), close by thanking them and end your final message with the exact token ASSESSMENT_COMPLETE on its own line.

If the candidate gives very short answers, ask a brief follow-up. If they seem done, you may close with ASSESSMENT_COMPLETE.`;

export async function groqTranscribe(audio: Buffer, filename: string): Promise<string> {
  const key = apiKey();
  const model = process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
  const form = new FormData();
  form.append("file", new File([Uint8Array.from(audio)], filename, { type: "application/octet-stream" }));
  form.append("model", model);
  form.append("language", "en");
  form.append("response_format", "json");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    hackmateServerLog("hackmate:groq", "transcribe_failed", { status: res.status, err: err.slice(0, 400) }, "warn");
    throw new Error("Transcription failed");
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Groq /audio/speech (Orpheus) returns 400 if response_format is not wav. */
const GROQ_TTS_RESPONSE_FORMATS = new Set(["wav"]);

export async function groqSpeech(text: string): Promise<{ buffer: Buffer; contentType: string }> {
  const key = apiKey();
  const model = process.env.GROQ_TTS_MODEL?.trim() || "canopylabs/orpheus-v1-english";
  const voice = process.env.GROQ_TTS_VOICE?.trim() || "hannah";
  const fromEnv = process.env.GROQ_TTS_FORMAT?.trim().toLowerCase();
  const responseFormat =
    fromEnv && GROQ_TTS_RESPONSE_FORMATS.has(fromEnv) ? fromEnv : "wav";

  const trimmed = text.trim().slice(0, 4000);
  if (!trimmed) throw new Error("Empty TTS text");

  const res = await fetch(`${GROQ_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: trimmed,
      response_format: responseFormat,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    hackmateServerLog("hackmate:groq", "tts_failed", { status: res.status, err: err.slice(0, 400) }, "warn");
    throw new Error("Speech synthesis failed");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const ct = responseFormat === "wav" ? "audio/wav" : "audio/mpeg";
  return { buffer: buf, contentType: ct };
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function groqAgentReply(history: ChatMsg[]): Promise<string> {
  const key = apiKey();
  const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";

  const messages: ChatMsg[] = [{ role: "system", content: VOICE_AGENT_SYSTEM_PROMPT }, ...history];

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: 350,
      temperature: 0.55,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    hackmateServerLog("hackmate:groq", "chat_failed", { status: res.status, err: err.slice(0, 400) }, "warn");
    throw new Error("Assistant reply failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Empty assistant reply");
  return content;
}

export function openingBootstrapMessage(eventTitle: string): ChatMsg {
  return {
    role: "user",
    content: `[The candidate just connected to the voice assessment for the hackathon ${JSON.stringify(eventTitle)}. Greet them briefly, explain you'll ask a few short spoken questions for team matching (like a quick phone screen), and ask your first question about their background or strongest skills.]`,
  };
}
