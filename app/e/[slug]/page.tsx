"use client";

import { HackMateLogo } from "@/components/HackMateLogo";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type EventInfo = {
  title: string;
  description: string | null;
  locationSummary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  registrationOpen: boolean;
  slug: string;
};

export default function PublicEventPage() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/public/events/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Event not found");
        setLoading(false);
        return;
      }
      setEvent(data.event);
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    setDone(null);
    setError(null);
  }, [slug]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    const consentToCall = fd.get("consentToCall") === "on";
    const payload = {
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      city: String(fd.get("city") ?? ""),
      universityOrCompany: String(fd.get("universityOrCompany") ?? ""),
      knownSkills: String(fd.get("knownSkills") ?? ""),
      existingTeamName: String(fd.get("existingTeamName") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      consentToCall,
    };

    const res = await fetch(`/api/public/events/${encodeURIComponent(slug)}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not register");
      return;
    }
    setDone(data.message ?? "You’re registered.");
    e.currentTarget.reset();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <p className="text-red-600">{error ?? "Not found"}</p>
      </div>
    );
  }

  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="flex items-start gap-4">
            <HackMateLogo size={52} className="mt-1 shrink-0 drop-shadow-md" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                HackMate · Registration
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
              {event.locationSummary ? (
                <p className="mt-2 text-[var(--muted)]">{event.locationSummary}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                {event.startsAt ? <span>Starts {fmt(event.startsAt)}</span> : null}
                {event.endsAt ? <span>Ends {fmt(event.endsAt)}</span> : null}
              </div>
              {event.description ? (
                <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{event.description}</p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {done ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-[var(--card)] px-8 py-14 text-center shadow-sm shadow-emerald-950/5">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/35">
              <svg
                className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">You&apos;re signed up</h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[var(--muted)]">{done}</p>
            <p className="mt-8 text-sm font-medium text-[var(--foreground)]">{event.title}</p>
          </div>
        ) : !event.registrationOpen ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Registration is closed for this event.
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Full name
                <input
                  name="fullName"
                  required
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium">
                Phone (E.164 recommended, e.g. +491234567890)
                <input
                  name="phone"
                  required
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium">
                City
                <input
                  name="city"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium">
                University / company
                <input
                  name="universityOrCompany"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Known skills (comma-separated)
                <input
                  name="knownSkills"
                  placeholder="e.g. React, Python, Figma"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Existing team name (if any)
                <input
                  name="existingTeamName"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Notes for organizers
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 text-sm">
              <input name="consentToCall" type="checkbox" className="mt-1" required />
              <span className="text-[var(--muted)]">
                I agree to be contacted by phone for HackMate voice team matching, and I understand my
                answers are used only for hackathon team formation (GDPR-friendly processing).
              </span>
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 sm:w-auto sm:px-8"
            >
              Register
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
        Powered by HackMate
      </footer>
    </div>
  );
}
