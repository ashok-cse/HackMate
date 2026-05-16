"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  slug: string;
  title: string;
  registrationOpen: boolean;
  registrationCount: number;
  startsAt: string | null;
};

export default function EventsListPage() {
  const [events, setEvents] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/events", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setEvents(data.events);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-[var(--muted)]">
            Public registration links (Luma-style). Promote signups into the calling pipeline when ready.
          </p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          New event
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-[var(--muted)] dark:bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Public link</th>
              <th className="px-3 py-2">Registrations</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const path = `/e/${ev.slug}`;
              return (
                <tr key={ev.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{ev.title}</td>
                  <td className="px-3 py-2">
                    <code className="text-xs text-[var(--muted)]">{path}</code>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{ev.registrationCount}</td>
                  <td className="px-3 py-2">
                    {ev.registrationOpen ? (
                      <span className="text-emerald-700 dark:text-emerald-300">Open</span>
                    ) : (
                      <span className="text-[var(--muted)]">Closed</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/events/${ev.id}`}
                      className="text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
