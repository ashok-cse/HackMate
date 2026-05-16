"use client";

import { VoiceCallAgent } from "@/components/VoiceCallAgent";
import { HackMateLogo } from "@/components/HackMateLogo";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function VoiceAssessmentPage() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const token = String(params.token ?? "");
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [voiceAgentAvailable, setVoiceAgentAvailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setLoadError(null);
      const res = await fetch(
        `/api/public/events/${encodeURIComponent(slug)}/voice-assessment/${encodeURIComponent(token)}`,
      );
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(data.error ?? "This link is invalid or expired.");
        setEventTitle(null);
        setVoiceAgentAvailable(false);
        setLoading(false);
        return;
      }
      setEventTitle(data.eventTitle ?? "Event");
      setVoiceAgentAvailable(Boolean(data.voiceAgentAvailable));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (loadError || !eventTitle) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4">
        <p className="max-w-md text-center text-red-600">{loadError ?? "Something went wrong."}</p>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          If you were promoted to a participant, check your email for the voice assessment link, or contact the
          organizers.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-white text-[var(--foreground)] dark:from-sky-950/30 dark:via-[var(--background)] dark:to-[var(--background)]">
      <header className="border-b border-[var(--border)]/80 bg-[var(--card)]/80 backdrop-blur-sm dark:bg-[var(--card)]/90">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="flex items-start gap-4">
            <HackMateLogo size={52} className="mt-1 shrink-0 drop-shadow-md" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                HackMate · Voice assessment
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{eventTitle}</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Talk with our voice agent for team matching — same information we collect on a phone interview.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 pb-16">
        <VoiceCallAgent eventSlug={slug} inviteToken={token} voiceAgentAvailable={voiceAgentAvailable} />
      </main>

      <footer className="border-t border-[var(--border)]/80 bg-[var(--card)]/40 py-6 text-center text-xs text-[var(--muted)] backdrop-blur-sm dark:bg-transparent">
        Powered by HackMate
      </footer>
    </div>
  );
}
