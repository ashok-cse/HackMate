"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Ev = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  locationSummary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  registrationOpen: boolean;
  registrations: Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string;
    city: string | null;
    consentToCall: boolean;
    promotedParticipantId: string | null;
    createdAt: string;
  }>;
};

export default function EventManagePage() {
  const params = useParams();
  const id = String(params.id);
  const [event, setEvent] = useState<Ev | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setEvent(data.event);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: String(fd.get("title") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        description: String(fd.get("description") ?? "") || null,
        locationSummary: String(fd.get("locationSummary") ?? "") || null,
        startsAt: String(fd.get("startsAt") ?? "") || null,
        endsAt: String(fd.get("endsAt") ?? "") || null,
        registrationOpen: fd.get("registrationOpen") === "on",
      }),
    });
    if (!res.ok) setMsg(await res.text());
    else setMsg("Saved.");
    await load();
  }

  async function promote() {
    setMsg(null);
    const res = await fetch(`/api/events/${id}/promote`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) setMsg(await res.text());
    else
      setMsg(
        `Promoted ${data.promoted}. Skipped duplicate email: ${data.skippedDuplicateEmail}. Unpromoted left: ${data.unpromotedRemaining}.`,
      );
    await load();
  }

  function copyLink() {
    if (!event || typeof window === "undefined") return;
    const url = `${window.location.origin}/e/${event.slug}`;
    void navigator.clipboard.writeText(url);
    setMsg(`Copied ${url}`);
  }

  if (!event) return <div className="text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="space-y-8">
      <Link href="/dashboard/events" className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
        ← Events
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          <p className="mt-1 font-mono text-sm text-[var(--muted)]">/e/{event.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copyLink()}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            Copy public link
          </button>
          <button
            type="button"
            onClick={() => void promote()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Promote to participants
          </button>
        </div>
      </div>

      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}

      <form
        onSubmit={(e) => void saveSettings(e)}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
      >
        <label className="block text-sm font-medium">
          Title
          <input name="title" defaultValue={event.title} required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <label className="block text-sm font-medium">
          Slug
          <input name="slug" defaultValue={event.slug} required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <label className="block text-sm font-medium">
          Location / format
          <input name="locationSummary" defaultValue={event.locationSummary ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea name="description" rows={4} defaultValue={event.description ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Starts
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={event.startsAt ? event.startsAt.slice(0, 16) : ""}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Ends
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={event.endsAt ? event.endsAt.slice(0, 16) : ""}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="registrationOpen" type="checkbox" defaultChecked={event.registrationOpen} />
          Registration open
        </label>
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          Save
        </button>
      </form>

      <div>
        <h2 className="text-lg font-semibold">Signups</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-[var(--muted)] dark:bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {event.registrations.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.fullName}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.phone}</td>
                  <td className="px-3 py-2">
                    {r.promotedParticipantId ? (
                      <span className="text-emerald-700 dark:text-emerald-300">In pipeline</span>
                    ) : (
                      <span className="text-[var(--muted)]">Portal only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
