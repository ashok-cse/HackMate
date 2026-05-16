"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getHackathon } from "@/components/HackathonFilter";

type Row = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  callStatus: string;
  profileStatus: string;
  profile: { ideaSummary: string | null; skills: unknown } | null;
};

export default function ParticipantsPage() {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const h = encodeURIComponent(getHackathon());
    const res = await fetch(`/api/participants?hackathon=${h}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setRows(data.participants);
  }, []);

  useEffect(() => {
    void load();
    const onH = () => void load();
    window.addEventListener("hackmate:hackathon", onH);
    return () => window.removeEventListener("hackmate:hackathon", onH);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Participants</h1>
          <p className="text-sm text-[var(--muted)]">Call status, profiles, quick actions.</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-[var(--muted)] dark:bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Call</th>
              <th className="px-3 py-2">Profile</th>
              <th className="px-3 py-2">Idea</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{p.fullName}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{p.email}</td>
                <td className="px-3 py-2">{p.callStatus}</td>
                <td className="px-3 py-2">{p.profileStatus}</td>
                <td className="max-w-xs truncate px-3 py-2 text-[var(--muted)]">
                  {p.profile?.ideaSummary ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Link className="text-emerald-700 hover:underline dark:text-emerald-300" href={`/dashboard/participants/${p.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
