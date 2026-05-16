"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "assistant" | "user"; content: string };

type Props = {
  eventSlug: string;
  inviteToken: string;
  voiceAgentAvailable: boolean;
};

type GreetingPayload = { mimeType: string; audioBase64: string };

type InputMode = "handsfree" | "hold";

const VAD_SILENCE_MS = 950;
const VAD_MIN_SPEECH_MS = 650;
const VAD_RMS_THRESHOLD = 0.018;
const VAD_MAX_RECORD_MS = 50_000;
const LEVEL_SMOOTH = 0.35;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return undefined;
}

function isPlaybackDenied(e: unknown): boolean {
  if (e && typeof e === "object" && "name" in e && (e as DOMException).name === "NotAllowedError") {
    return true;
  }
  if (e instanceof Error && /not allowed|user gesture|interact|autoplay/i.test(e.message)) {
    return true;
  }
  return false;
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
  const [phase, setPhase] = useState<
    "init" | "awaiting_start" | "ready" | "listening" | "processing" | "speaking" | "done"
  >("init");
  const [greeting, setGreeting] = useState<GreetingPayload | null>(null);
  const [tapToPlay, setTapToPlay] = useState<GreetingPayload & { afterPlay: () => void } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("handsfree");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const interviewComplete = messages.some((m) => m.role === "assistant" && /ASSESSMENT_COMPLETE/i.test(m.content));

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speakingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const vadFrameRef = useRef<number>(0);
  const vadContextRef = useRef<AudioContext | null>(null);
  const levelSmoothRef = useRef(0);
  const phaseRef = useRef(phase);
  const endingListenRef = useRef(false);
  const tapToPlayRef = useRef(tapToPlay);

  const base = agentBase(eventSlug, inviteToken);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    tapToPlayRef.current = tapToPlay;
  }, [tapToPlay]);

  const stopPlayback = useCallback(() => {
    const a = playbackRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      playbackRef.current = null;
    }
    speakingRef.current = false;
  }, []);

  const playAudio = useCallback((mime: string, b64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      stopPlayback();
      const audio = new Audio(`data:${mime};base64,${b64}`);
      playbackRef.current = audio;
      speakingRef.current = true;
      audio.onended = () => {
        playbackRef.current = null;
        speakingRef.current = false;
        resolve();
      };
      audio.onerror = () => {
        playbackRef.current = null;
        speakingRef.current = false;
        reject(new Error("Playback failed"));
      };
      void audio.play().catch((e) => {
        playbackRef.current = null;
        speakingRef.current = false;
        reject(e);
      });
    });
  }, [stopPlayback]);

  const stopStream = useCallback(() => {
    stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopPlayback]);

  useEffect(() => {
    return () => {
      stopStream();
      if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
      void vadContextRef.current?.close();
    };
  }, [stopStream]);

  const speakResponse = useCallback(
    async (text: string) => {
      const res = await fetch(`${base}/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "TTS failed");
      }
      const mime = data.mimeType ?? "audio/mpeg";
      const b64 = data.audioBase64 as string;

      setPhase("speaking");
      try {
        await playAudio(mime, b64);
      } catch (e) {
        if (isPlaybackDenied(e)) {
          setPhase("ready");
          setTapToPlay({
            mimeType: mime,
            audioBase64: b64,
            afterPlay: () => {
              setTapToPlay(null);
            },
          });
          return;
        }
        setPhase("ready");
        throw e;
      }
      setPhase("ready");
    },
    [base, playAudio],
  );

  const processRecordingBlob = useCallback(
    async (blob: Blob) => {
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
    },
    [base, speakResponse],
  );

  const cancelVad = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }
    void vadContextRef.current?.close();
    vadContextRef.current = null;
    setVoiceLevel(0);
    levelSmoothRef.current = 0;
  }, []);

  /* Opening fetch */
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
      setGreeting(null);
      try {
        const res = await fetch(`${base}/opening`, { method: "POST" });
        let data: { error?: string; text?: string; mimeType?: string; audioBase64?: string };
        try {
          data = await res.json();
        } catch {
          if (!cancelled) {
            setLocalError("Invalid response from server.");
            setPhase("ready");
          }
          return;
        }
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
        setGreeting({
          mimeType: data.mimeType ?? "audio/mpeg",
          audioBase64: data.audioBase64 ?? "",
        });
        setPhase("awaiting_start");
      } catch (e) {
        if (!cancelled) {
          setLocalError(e instanceof Error ? e.message : "Could not start the voice session.");
          setPhase("ready");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, voiceAgentAvailable]);

  async function playGreetingFromTap() {
    if (!greeting?.audioBase64) {
      setPhase("ready");
      return;
    }
    setLocalError(null);
    setPhase("speaking");
    try {
      await playAudio(greeting.mimeType, greeting.audioBase64);
    } catch (e) {
      if (!isPlaybackDenied(e)) {
        setLocalError("Could not play audio. You can still read the message below.");
      }
    }
    setPhase("ready");
    setGreeting(null);
  }

  function skipGreetingAudio() {
    setGreeting(null);
    setPhase("ready");
  }

  async function playPendingTap() {
    if (!tapToPlay) return;
    const { mimeType, audioBase64, afterPlay } = tapToPlay;
    setLocalError(null);
    setPhase("speaking");
    try {
      await playAudio(mimeType, audioBase64);
    } catch {
      setLocalError("Playback failed. Read the agent text above.");
    }
    setPhase("ready");
    afterPlay();
  }

  async function ensureMic() {
    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    }
  }

  function finalizeRecorder(): Promise<Blob> {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      return Promise.resolve(new Blob());
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        resolve(b);
      };
      rec.stop();
    });
  }

  /** Stop agent audio — feels like interrupting a phone agent when you start talking. */
  async function beginListening(): Promise<MediaRecorder | null> {
    const p = phaseRef.current;
    if (!voiceAgentAvailable || p === "init" || p === "awaiting_start" || p === "processing" || p === "done") {
      return null;
    }
    if (tapToPlayRef.current) return null;

    stopPlayback();
    setLocalError(null);
    cancelVad();

    const existing = recorderRef.current;
    if (existing && existing.state !== "inactive") {
      try {
        existing.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }

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
      rec.start(250);
      setPhase("listening");
      return rec;
    } catch {
      setLocalError("Microphone permission is required.");
      setPhase("ready");
      return null;
    }
  }

  async function startHandsFree() {
    const rec = await beginListening();
    if (!rec || !streamRef.current) return;

    const ctx = new AudioContext();
    vadContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(streamRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let lastVoice = performance.now();
    const started = performance.now();

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = (samples[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      if (rms > VAD_RMS_THRESHOLD) {
        lastVoice = now;
      }
      const target = Math.min(1, rms / 0.12);
      levelSmoothRef.current = levelSmoothRef.current * (1 - LEVEL_SMOOTH) + target * LEVEL_SMOOTH;
      setVoiceLevel(levelSmoothRef.current);

      if (now - started > VAD_MAX_RECORD_MS) {
        void endListening();
        return;
      }
      if (now - lastVoice > VAD_SILENCE_MS && now - started > VAD_MIN_SPEECH_MS) {
        void endListening();
        return;
      }
      vadFrameRef.current = requestAnimationFrame(tick);
    };
    vadFrameRef.current = requestAnimationFrame(tick);
  }

  async function endListening() {
    if (endingListenRef.current) return;
    endingListenRef.current = true;
    try {
      cancelVad();
      const blob = await finalizeRecorder();
      recorderRef.current = null;
      setVoiceLevel(0);
      await processRecordingBlob(blob);
    } finally {
      endingListenRef.current = false;
    }
  }

  async function pushStart() {
    await beginListening();
  }

  async function pushEnd() {
    if (inputMode !== "hold") return;
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setPhase("ready");
      return;
    }
    cancelVad();
    const blob = await finalizeRecorder();
    recorderRef.current = null;
    await processRecordingBlob(blob);
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

  const canInteractMic =
    voiceAgentAvailable &&
    phase !== "init" &&
    phase !== "awaiting_start" &&
    phase !== "processing" &&
    phase !== "done" &&
    !tapToPlay;

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
        <h3 className="text-lg font-semibold tracking-tight">Interactive voice agent</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          This works like a short phone screen: the agent speaks, then <strong>you</strong> speak. Tap{" "}
          <strong>Your turn</strong>, talk naturally, and <strong>pause when you&apos;re done</strong> — we detect the
          pause and send your turn (Groq Whisper). The agent answers with Groq TTS. You can <strong>interrupt</strong>{" "}
          playback by starting your turn. True duplex streaming isn&apos;t possible with file-based STT in the browser;
          this is the closest pattern without a telephony stack.
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={inputMode === "hold"}
            onChange={(e) => setInputMode(e.target.checked ? "hold" : "handsfree")}
            className="rounded border-[var(--border)]"
          />
          Use hold-to-talk instead of pause-to-send
        </label>
      </div>

      {localError ? <p className="text-sm text-red-600">{localError}</p> : null}

      {tapToPlay ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <p className="text-[var(--foreground)]">Tap to play the agent&apos;s latest reply.</p>
          <button
            type="button"
            onClick={() => void playPendingTap()}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
          >
            Play reply
          </button>
        </div>
      ) : null}

      {phase === "awaiting_start" && greeting ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void playGreetingFromTap()}
            className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Tap to start — play introduction
          </button>
          <button
            type="button"
            onClick={skipGreetingAudio}
            className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-medium hover:bg-[var(--background)]"
          >
            Skip audio (read only)
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Live conversation</p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {inputMode === "handsfree" ? (
          <>
            <button
              type="button"
              disabled={!canInteractMic || phase === "listening"}
              onClick={() => void startHandsFree()}
              className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Your turn — tap, speak, pause when done
            </button>
            {phase === "listening" ? (
              <>
                <button
                  type="button"
                  onClick={() => void endListening()}
                  className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-medium hover:bg-[var(--card)]"
                >
                  Stop &amp; send now
                </button>
                <div className="flex min-w-[140px] flex-1 items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">Level</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                      style={{ width: `${Math.round(voiceLevel * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Listening… pause when finished
                </span>
              </>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={
                !canInteractMic || phase === "speaking" || phase === "listening" || Boolean(tapToPlay)
              }
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
                Recording…
              </span>
            ) : null}
          </>
        )}

        {phase === "processing" ? <span className="text-sm text-[var(--muted)]">Thinking…</span> : null}
        {phase === "speaking" ? <span className="text-sm text-[var(--muted)]">Agent speaking…</span> : null}
        {phase === "init" ? <span className="text-sm text-[var(--muted)]">Connecting…</span> : null}
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
