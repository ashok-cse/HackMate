"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "assistant" | "user"; content: string };

type Props = {
  eventSlug: string;
  inviteToken: string;
  voiceAgentAvailable: boolean;
};

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return undefined;
}

function playBase64(mime: string, b64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:${mime};base64,${b64}`);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Playback failed"));
    void audio.play().catch(reject);
  });
}

function stripComplete(s: string): string {
  return s.replace(/\s*ASSESSMENT_COMPLETE\s*$/im, "").trim();
}

function buildTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const c = stripComplete(m.content);
      if (!c) return null;
      const label = m.role === "assistant" ? "Agent" : "Candidate";
      return `${label}: ${c}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function agentBase(eventSlug: string, token: string) {
  return `/api/public/events/${encodeURIComponent(eventSlug)}/voice-assessment/${encodeURIComponent(token)}/agent`;
}

export function VoiceCallAgent({ eventSlug, inviteToken, voiceAgentAvailable }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<"init" | "ready" | "listening" | "processing" | "speaking" | "done">("init");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const interviewComplete = messages.some((m) => m.role === "assistant" && /ASSESSMENT_COMPLETE/i.test(m.content));

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speakingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const base = agentBase(eventSlug, inviteToken);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const speakResponse = useCallback(
    async (text: string) => {
      const display = stripComplete(text);
      const res = await fetch(`${base}/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "TTS failed");
      }
      setPhase("speaking");
      speakingRef.current = true;
      await playBase64(data.mimeType ?? "audio/mpeg", data.audioBase64);
      speakingRef.current = false;
      setPhase("ready");
    },
    [base],
  );

  useEffect(() => {
    if (!voiceAgentAvailable) {
      setPhase("ready");
      setLocalError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setPhase("init");
      setLocalError(null);
      try {
        const res = await fetch(`${base}/opening`, { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLocalError(data.error ?? "Could not start the agent.");
          setPhase("ready");
          return;
        }
        const text = data.text as string;
        const initial: ChatMessage[] = [{ role: "assistant", content: text }];
        messagesRef.current = initial;
        setMessages(initial);
        setPhase("speaking");
        speakingRef.current = true;
        await playBase64(data.mimeType, data.audioBase64);
        speakingRef.current = false;
        if (!cancelled) setPhase("ready");
      } catch {
        if (!cancelled) {
          setLocalError("Could not start the voice session.");
          setPhase("ready");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, voiceAgentAvailable]);

  async function ensureMic() {
    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    }
  }

  async function pushStart() {
    if (!voiceAgentAvailable || phase === "init" || speakingRef.current || phase === "processing") return;
    setLocalError(null);
    try {
      await ensureMic();
      const stream = streamRef.current!;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.start();
      setPhase("listening");
    } catch {
      setLocalError("Microphone permission is required.");
      setPhase("ready");
    }
  }

  async function pushEnd() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setPhase("ready");
      return;
    }

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        resolve(b);
      };
      rec.stop();
    });

    recorderRef.current = null;
    if (blob.size < 400) {
      setPhase("ready");
      return;
    }

    setPhase("processing");

    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    const fd = new FormData();
    fd.append("audio", blob, `recording.${ext}`);

    try {
      const tr = await fetch(`${base}/transcribe`, { method: "POST", body: fd });
      const trData = await tr.json();
      if (!tr.ok) {
        throw new Error(trData.error ?? "Transcription failed");
      }
      const userText = String(trData.text ?? "").trim();
      if (!userText) {
        setPhase("ready");
        return;
      }

      const nextMsgs: ChatMessage[] = [...messagesRef.current, { role: "user", content: userText }];
      messagesRef.current = nextMsgs;
      setMessages(nextMsgs);

      const cr = await fetch(`${base}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
      });
      const crData = await cr.json();
      if (!cr.ok) {
        throw new Error(crData.error ?? "Agent failed");
      }
      const assistantText = String(crData.text ?? "").trim();
      if (!assistantText) {
        throw new Error("Empty reply");
      }

      const withBot: ChatMessage[] = [...nextMsgs, { role: "assistant", content: assistantText }];
      messagesRef.current = withBot;
      setMessages(withBot);
      await speakResponse(assistantText);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("ready");
    }
  }

  async function onSubmitFinal(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    setSubmitOk(null);
    const transcript = buildTranscript(messages);
    if (transcript.length < 12) {
      setSubmitErr("Have a short conversation with the agent first, then submit.");
      return;
    }
    setSubmitting(true);
    const res = await fetch(
      `/api/public/events/${encodeURIComponent(eventSlug)}/voice-assessment/${encodeURIComponent(inviteToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      },
    );
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setSubmitErr(data.error ?? "Submit failed");
      return;
    }
    setSubmitOk(data.message ?? "Saved.");
    setPhase("done");
  }

  if (!voiceAgentAvailable) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        Voice agent is offline (missing <code className="text-xs">GROQ_API_KEY</code> on the server). Contact the
        organizers.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Voice call agent</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Hold <strong>Hold to speak</strong>, release when you’ve finished your answer. The agent listens (Groq
          speech-to-text), thinks, and talks back (Groq text-to-speech)—same information we get from a phone
          interview.
        </p>
      </div>

      {localError ? <p className="text-sm text-red-600">{localError}</p> : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Conversation</p>
        <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "assistant" ? "text-[var(--foreground)]" : "text-[var(--muted)]"}>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {m.role === "assistant" ? "Agent" : "You"}
              </span>
              <span className="text-[var(--foreground)]"> — {stripComplete(m.content) || "…"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={phase === "init" || phase === "processing" || phase === "speaking" || phase === "done"}
          onPointerDown={() => void pushStart()}
          onPointerUp={() => void pushEnd()}
          onPointerLeave={() => {
            if (phase === "listening") void pushEnd();
          }}
          className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {phase === "listening" ? "Release to send" : "Hold to speak"}
        </button>
        {phase === "listening" ? (
          <span className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Listening…
          </span>
        ) : null}
        {phase === "processing" ? <span className="text-sm text-[var(--muted)]">Processing…</span> : null}
        {phase === "speaking" ? <span className="text-sm text-[var(--muted)]">Agent speaking…</span> : null}
        {phase === "init" ? <span className="text-sm text-[var(--muted)]">Starting session…</span> : null}
      </div>

      {interviewComplete ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Interview complete — submit below so we can run team matching on your answers.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          The agent will signal when enough is covered. You can also submit anytime after a few exchanges.
        </p>
      )}

      <form onSubmit={(e) => void onSubmitFinal(e)} className="space-y-2 border-t border-[var(--border)] pt-5">
        {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
        {submitOk ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{submitOk}</p> : null}
        <button
          type="submit"
          disabled={submitting || phase === "done" || !messages.some((m) => m.role === "user")}
          className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-45"
        >
          {submitting ? "Saving…" : "Submit voice profile"}
        </button>
      </form>
    </div>
  );
}
