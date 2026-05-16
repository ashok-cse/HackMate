"use client";

import { useCallback, useEffect, useState } from "react";
import { getHackathon } from "@/components/HackathonFilter";

export default function UnmatchedPage() {
  const [rows, setRows] = useState<
    { id: string; fullName: string; email: string; callStatus: string; profileStatus: string }[]
  >([]);

  const load = useCallback(async () => {
    const h = encodeURIComponent(getHackathon());
    const res = await fetch(`/api/participants?hackathon=${h}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.participants.filter(
      (p: { teamMemberships: unknown[]; profileStatus: string; callStatus: string }) =>
        p.teamMemberships.length === 0 ||
        p.profileStatus === "needs_manual_review" ||
        p.callStatus === "no_answer",
    );
    setRows(list);
  }, []);

  useEffect(() => {
    void load();
    const onH = () => void load();
    window.addEventListener("hackmate:hackathon", onH);
    return () => window.removeEventListener("hackmate:hackathon", onH);
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Unmatched / attention</h1>
        <p className="text-sm text-[var(--muted)]">
          Participants without a team assignment or needing organizer follow-up.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-[var(--muted)] dark:bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Call</th>
              <th className="px-3 py-2">Profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{p.fullName}</td>
                <td className="px-3 py-2">{p.email}</td>
                <td className="px-3 py-2">{p.callStatus}</td>
                <td className="px-3 py-2">{p.profileStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
