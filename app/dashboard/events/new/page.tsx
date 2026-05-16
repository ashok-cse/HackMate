"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewEventPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? "") || undefined,
      locationSummary: String(fd.get("locationSummary") ?? "") || undefined,
      slug: String(fd.get("slug") ?? "").trim() || undefined,
      startsAt: String(fd.get("startsAt") ?? "") || null,
      endsAt: String(fd.get("endsAt") ?? "") || null,
      registrationOpen: fd.get("registrationOpen") === "on",
    };

    const res = await fetch("/api/events", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.push(`/dashboard/events/${data.event.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/dashboard/events" className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
        ← Events
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New event</h1>
        <p className="text-sm text-[var(--muted)]">
          Creates a public page at <code className="text-xs">/e/your-slug</code>. Leave slug blank to auto-generate.
        </p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <label className="block text-sm font-medium">
          Title *
          <input name="title" required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <label className="block text-sm font-medium">
          URL slug (optional)
          <input
            name="slug"
            placeholder="tech-europe-2026"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Location / format
          <input name="locationSummary" placeholder="Berlin · Hybrid" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea name="description" rows={5} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Starts
            <input name="startsAt" type="datetime-local" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
          </label>
          <label className="block text-sm font-medium">
            Ends
            <input name="endsAt" type="datetime-local" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="registrationOpen" type="checkbox" defaultChecked />
          Registration open
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          Create event
        </button>
      </form>
    </div>
  );
}
