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

async function readVoiceApiJson(res: Response): Promise<{
  ok: boolean;
  data: Record<string, unknown>;
  parseFailed: boolean;
}> {
  const text = await res.text();
  let parseFailed = false;
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parseFailed = true;
      data = {
        error:
          res.status >= 502
            ? "Voice service temporarily unavailable. Try again shortly."
            : "Invalid response from server.",
      };
    }
  }
  return { ok: res.ok && !parseFailed, data, parseFailed };
}

function VoiceMicGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V7c0-1.66-1.34-3-3-3S9 5.34 9 7v4c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.22 14.53 16 12 16s-4.52-1.78-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3.18 3.06 5.61 6.41 6.04V21c0 .55.45 1 1 1s1-.45 1-1v-4.76c3.34-.43 5.93-2.86 6.41-6.03.09-.61-.39-1.15-1-1.15z" />
    </svg>
  );
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
  const [conversationOpen, setConversationOpen] = useState(false);
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
      const { ok, data } = await readVoiceApiJson(res);
      if (!ok) {
        throw new Error(typeof data.error === "string" ? data.error : "TTS failed");
      }
      const mime = typeof data.mimeType === "string" ? data.mimeType : "audio/mpeg";
      const b64 = typeof data.audioBase64 === "string" ? data.audioBase64 : "";

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
        const trParsed = await readVoiceApiJson(tr);
        if (!trParsed.ok) {
          throw new Error(
            typeof trParsed.data.error === "string" ? trParsed.data.error : "Transcription failed",
          );
        }
        const userText = String(trParsed.data.text ?? "").trim();
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
        const crParsed = await readVoiceApiJson(cr);
        if (!crParsed.ok) {
          throw new Error(typeof crParsed.data.error === "string" ? crParsed.data.error : "Agent failed");
        }
        const assistantText = String(crParsed.data.text ?? "").trim();
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
        const openParsed = await readVoiceApiJson(res);
        if (cancelled) return;
        if (!openParsed.ok) {
          setLocalError(
            typeof openParsed.data.error === "string"
              ? openParsed.data.error
              : "Could not start the agent.",
          );
          setPhase("ready");
          return;
        }
        const text = String(openParsed.data.text ?? "").trim();
        if (!text) {
          setLocalError("Could not start the agent.");
          setPhase("ready");
          return;
        }
        const initial: ChatMessage[] = [{ role: "assistant", content: text }];
        messagesRef.current = initial;
        setMessages(initial);

        const ttsRes = await fetch(`${base}/tts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const ttsParsed = await readVoiceApiJson(ttsRes);
        if (cancelled) return;
        const b64 = typeof ttsParsed.data.audioBase64 === "string" ? ttsParsed.data.audioBase64 : "";
        if (ttsParsed.ok && b64.length > 0) {
          setGreeting({
            mimeType: typeof ttsParsed.data.mimeType === "string" ? ttsParsed.data.mimeType : "audio/mpeg",
            audioBase64: b64,
          });
          setPhase("awaiting_start");
        } else {
          setGreeting(null);
          setPhase("ready");
        }
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

  const startHandsFreeRef = useRef(startHandsFree);
  startHandsFreeRef.current = startHandsFree;

  /** After session starts, stay hands-free: each turn begins listening without another mic tap. */
  useEffect(() => {
    if (phase !== "ready") return;
    if (inputMode !== "handsfree") return;
    if (tapToPlay !== null) return;
    if (!voiceAgentAvailable) return;
    if (interviewComplete) return;

    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (phaseRef.current !== "ready") return;
      if (tapToPlayRef.current) return;
      const complete = messagesRef.current.some(
        (m) => m.role === "assistant" && /ASSESSMENT_COMPLETE/i.test(m.content),
      );
      if (complete) return;
      await startHandsFreeRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, inputMode, tapToPlay, voiceAgentAvailable, interviewComplete]);

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

  async function submitVoiceProfile(): Promise<boolean> {
    setSubmitErr(null);
    setSubmitOk(null);
    const transcript = buildTranscript(messagesRef.current);
    if (transcript.length < 12) {
      setSubmitErr("Have a short conversation with the agent first, then submit.");
      return false;
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
    const parsed = await readVoiceApiJson(res);
    setSubmitting(false);
    if (!parsed.ok) {
      setSubmitErr(typeof parsed.data.error === "string" ? parsed.data.error : "Submit failed");
      return false;
    }
    setSubmitOk(typeof parsed.data.message === "string" ? parsed.data.message : "Saved.");
    setPhase("done");
    stopStream();
    cancelVad();
    return true;
  }

  const submitVoiceProfileRef = useRef(submitVoiceProfile);
  submitVoiceProfileRef.current = submitVoiceProfile;

  const autoSubmitAttemptedRef = useRef(false);

  useEffect(() => {
    if (!interviewComplete || phase !== "ready") return;
    if (tapToPlay !== null) return;
    if (submitting) return;
    const transcript = buildTranscript(messagesRef.current);
    if (transcript.length < 12) return;
    if (autoSubmitAttemptedRef.current) return;

    autoSubmitAttemptedRef.current = true;
    void submitVoiceProfileRef.current();
  }, [interviewComplete, phase, tapToPlay, submitting, messages]);

  const handsfreeMicClickOk =
    (phase === "awaiting_start" && Boolean(greeting?.audioBase64)) ||
    Boolean(
      tapToPlay === null &&
        inputMode === "handsfree" &&
        phase !== "init" &&
        phase !== "awaiting_start" &&
        phase !== "processing" &&
        phase !== "listening" &&
        phase !== "done" &&
        (phase === "ready" || phase === "speaking"),
    );

  /** Hold must stay enabled while recording so pointer-up still fires — only gate pointer-down starts. */
  const holdRecordingStartOk =
    inputMode === "hold" &&
    !tapToPlay &&
    phase === "ready" &&
    voiceAgentAvailable;

  const handsfreeMicDisabled =
    tapToPlay !== null ||
    phase === "init" ||
    phase === "listening" ||
    phase === "processing" ||
    phase === "done" ||
    !handsfreeMicClickOk;

  const micMutedLook =
    tapToPlay !== null ||
    phase === "init" ||
    phase === "processing" ||
    phase === "done" ||
    (inputMode === "hold" && phase === "speaking");

  let statusCaption = "";
  if (phase === "init") statusCaption = "Connecting…";
  else if (tapToPlay) statusCaption = "Playback needed — tap play reply below";
  else if (phase === "awaiting_start") statusCaption = "Tap to start";
  else if (phase === "listening")
    statusCaption = inputMode === "hold" ? "Recording — release to send" : "Listening — pause briefly when done";
  else if (phase === "processing") statusCaption = "Thinking…";
  else if (phase === "speaking") statusCaption = "Agent speaking…";
  else if (phase === "done") statusCaption = "Saved";
  else if (phase === "ready")
    statusCaption = inputMode === "hold" ? "Hold to speak" : "Hands-free — mic opens automatically";

  if (!voiceAgentAvailable) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        Voice agent is offline (missing <code className="text-xs">GROQ_API_KEY</code> on the server). Contact the
        organizers.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <button
        type="button"
        onClick={() => setConversationOpen((v) => !v)}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-[var(--card)] px-4 py-2 text-sm font-medium text-slate-600 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-[var(--muted)]"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 dark:text-[var(--muted)] ${conversationOpen ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
        {conversationOpen ? "Hide conversation" : "Show conversation"}
      </button>

      {localError ? <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">{localError}</p> : null}

      {tapToPlay ? (
        <div className="mb-5 rounded-2xl border border-sky-200/80 bg-sky-50/90 px-4 py-4 text-center text-sm text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-slate-200">
          <p>Tap to hear the agent (browser blocked auto-play).</p>
          <button
            type="button"
            onClick={() => void playPendingTap()}
            className="mt-3 rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:bg-sky-400"
          >
            Play reply
          </button>
        </div>
      ) : null}

      <div className="rounded-[1.75rem] bg-[var(--card)] px-8 pb-10 pt-12 shadow-[0_22px_50px_-12px_rgba(14,165,233,0.22)] dark:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col items-center gap-8">
          <button
            type="button"
            aria-label={
              phase === "awaiting_start"
                ? "Play introduction"
                : inputMode === "hold"
                  ? phase === "listening"
                    ? "Recording — release to send"
                    : "Hold to speak"
                  : phase === "listening"
                    ? "Listening hands-free"
                    : phase === "speaking"
                      ? "Interrupt agent"
                      : "Hands-free session active"
            }
            disabled={inputMode === "handsfree" ? handsfreeMicDisabled : false}
            onClick={() => {
              if (phase === "awaiting_start" && greeting?.audioBase64) {
                void playGreetingFromTap();
                return;
              }
              if (inputMode !== "handsfree") return;
              if (handsfreeMicDisabled) return;
              void startHandsFree();
            }}
            onPointerDown={
              holdRecordingStartOk
                ? () => {
                    void pushStart();
                  }
                : undefined
            }
            onPointerUp={
              inputMode === "hold" && phase === "listening"
                ? () => {
                    void pushEnd();
                  }
                : undefined
            }
            onPointerLeave={
              inputMode === "hold" && phase === "listening"
                ? () => {
                    void pushEnd();
                  }
                : undefined
            }
            className={`relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full text-white outline-none ring-offset-2 ring-offset-[var(--card)] transition-transform focus-visible:ring-2 focus-visible:ring-sky-400 ${
              phase === "listening"
                ? "scale-105 bg-sky-500 shadow-[0_14px_40px_-10px_rgba(14,165,233,0.55)] ring-4 ring-sky-300/50 dark:ring-sky-500/30"
                : "bg-sky-500 shadow-[0_16px_40px_-12px_rgba(14,165,233,0.45)] hover:bg-sky-400"
            } ${micMutedLook && phase !== "listening" ? "opacity-45 grayscale-[0.15]" : ""} cursor-pointer`}
          >
            {phase === "init" ? (
              <span className="flex h-10 w-10 animate-pulse rounded-full bg-white/30" />
            ) : (
              <VoiceMicGlyph className="h-[2.85rem] w-[2.85rem] text-white" />
            )}
          </button>

          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {statusCaption}
            </p>
            {phase === "awaiting_start" ? (
              <button
                type="button"
                onClick={skipGreetingAudio}
                className="text-xs font-medium text-sky-600 underline decoration-sky-300 underline-offset-2 hover:text-sky-500 dark:text-sky-400 dark:decoration-sky-700"
              >
                Skip introduction (read transcript only)
              </button>
            ) : null}
          </div>

          {inputMode === "handsfree" && phase === "listening" ? (
            <div className="w-full max-w-xs space-y-3 px-2">
              <button
                type="button"
                onClick={() => void endListening()}
                className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                Stop &amp; send now
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-[var(--muted)]">{Math.round(voiceLevel * 100)}%</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-[width] duration-75 dark:bg-sky-500"
                    style={{ width: `${Math.round(voiceLevel * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <label className="mt-6 flex cursor-pointer items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={inputMode === "hold"}
          onChange={(e) => setInputMode(e.target.checked ? "hold" : "handsfree")}
          className="rounded border-[var(--border)]"
        />
        Hold to talk instead of pause-to-send
      </label>

      <details className="mt-4 rounded-xl border border-[var(--border)]/80 bg-[var(--card)]/60 px-4 py-3 text-sm backdrop-blur-sm dark:bg-[var(--card)]/40 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-[var(--muted)] [&_summary]:outline-none [&_summary]:focus-visible:ring-2 [&_summary]:focus-visible:ring-sky-400">
        <summary>How this session works</summary>
        <p className="mt-3 leading-relaxed text-[var(--muted)]">
          After you start, the mic stays hands-free: each time the agent finishes, we listen again automatically.
          Pause briefly when you&apos;re done talking so we can transcribe. Tap the mic while the agent speaks if you
          need to interrupt.
        </p>
      </details>

      {conversationOpen ? (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 p-4 shadow-sm backdrop-blur-sm dark:bg-[var(--card)]/70">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Conversation</p>
          <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm">
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
      ) : null}

      {interviewComplete ? (
        <p className="mt-6 text-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Interview complete — saving your voice profile for team matching…
        </p>
      ) : (
        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Tap once to start (or skip the intro). After that it stays hands-free; we save automatically when the agent
          wraps up.
        </p>
      )}

      <div className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
        {submitErr ? (
          <>
            <p className="text-sm text-red-600 dark:text-red-400">{submitErr}</p>
            <button
              type="button"
              onClick={() => void submitVoiceProfile()}
              disabled={submitting}
              className="w-full rounded-full bg-[var(--foreground)] py-3 text-sm font-semibold text-[var(--background)] hover:opacity-90 disabled:opacity-45 sm:w-auto sm:min-w-[12rem] sm:px-8"
            >
              {submitting ? "Saving…" : "Try saving again"}
            </button>
          </>
        ) : null}
        {!submitErr && submitOk ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{submitOk}</p>
        ) : null}
        {!submitErr && interviewComplete && phase !== "done" ? (
          <p className="text-center text-sm text-[var(--muted)]">Saving…</p>
        ) : null}
      </div>
    </div>
  );
}
