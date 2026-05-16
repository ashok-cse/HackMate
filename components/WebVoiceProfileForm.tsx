"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecCtor = new () => SpeechRec;

function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Props = {
  eventSlug: string;
  registrationId: string;
};

export function WebVoiceProfileForm({ eventSlug, registrationId }: Props) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  const supported = typeof window !== "undefined" && Boolean(getSpeechRecognition());

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  function startListening() {
    setBrowserError(null);
    setSubmitOk(null);
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setBrowserError("Speech recognition is not available in this browser. Try Chrome or Edge, or type below.");
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

    rec.onresult = (ev: Event) => {
      const e = ev as unknown as {
        resultIndex: number;
        results: Array<{ 0: { transcript: string }; isFinal: boolean }>;
      };
      let piece = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          piece += e.results[i][0].transcript;
        }
      }
      const trimmed = piece.trim();
      if (trimmed) {
        setTranscript((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
      }
    };

    rec.onerror = (ev: Event) => {
      const err = ev as unknown as { error?: string };
      if (err.error === "aborted" || err.error === "no-speech") return;
      setBrowserError(err.error ? `Mic / speech: ${err.error}` : "Speech recognition error");
      stopListening();
    };

    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setBrowserError("Could not start the microphone. Check permissions.");
      recRef.current = null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitOk(null);
    const text = transcript.trim();
    if (text.length < 12) {
      setSubmitError("Speak or type at least a short paragraph (skills, role, team preferences).");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/public/events/${encodeURIComponent(eventSlug)}/voice-profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, transcript: text }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(data.error ?? "Submit failed");
      return;
    }
    setSubmitOk(data.message ?? "Saved.");
    setTranscript("");
  }

  return (
    <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-left shadow-sm">
      <h3 className="text-lg font-semibold tracking-tight">Voice profile (browser)</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Same pipeline as a phone interview: your speech is turned into text, then we extract skills and team-fit
        fields for matching. Use your mic or type. Works best in Chrome / Edge.
      </p>

      {!supported ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          Voice capture may be limited here — you can still paste or type your answers below.
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {!listening ? (
            <button
              type="button"
              onClick={startListening}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start speaking
            </button>
          ) : (
            <button
              type="button"
              onClick={stopListening}
              className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-500/20 dark:text-red-300"
            >
              Stop
            </button>
          )}
          {listening ? (
            <span className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Listening…
            </span>
          ) : null}
        </div>

        {browserError ? <p className="text-sm text-red-600">{browserError}</p> : null}

        <label className="block text-sm font-medium">
          Transcript (edit if needed)
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Describe your skills, experience level, whether you want to lead, team size, project idea, and availability."
          />
        </label>

        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
        {submitOk ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{submitOk}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Submit voice profile"}
        </button>
      </form>
    </div>
  );
}
