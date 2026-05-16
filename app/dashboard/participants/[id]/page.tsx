"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function ParticipantDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [data, setData] = useState<unknown>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/participants/${id}`, { credentials: "include" });
    if (!res.ok) return;
    setData((await res.json()).participant);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryCall() {
    await fetch(`/api/participants/${id}/retry-call`, {
      method: "POST",
      credentials: "include",
    });
    await load();
  }

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading…</div>;

  const p = data as {
    fullName: string;
    email: string;
    phone: string;
    callStatus: string;
    profileStatus: string;
    organizerNotes: string | null;
    profile: Record<string, unknown> | null;
    calls: Array<{ transcriptText: string | null; status: string | null }>;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/participants" className="text-sm text-emerald-700 hover:underline dark:text-emerald-300">
        ← Participants
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{p.fullName}</h1>
        <p className="text-sm text-[var(--muted)]">
          {p.email} · {p.phone}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">call: {p.callStatus}</span>
          <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
            profile: {p.profileStatus}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
          onClick={() => void retryCall()}
        >
          Retry call (queue)
        </button>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">Latest transcript</h2>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)]">
          {p.calls[0]?.transcriptText ?? "No transcript yet."}
        </pre>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">Extracted profile JSON</h2>
        <pre className="mt-2 max-h-96 overflow-auto text-xs">
          {JSON.stringify(p.profile, null, 2)}
        </pre>
      </section>
    </div>
  );
}
