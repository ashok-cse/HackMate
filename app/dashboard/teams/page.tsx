"use client";

import { useCallback, useEffect, useState } from "react";
import { getHackathon } from "@/components/HackathonFilter";

export default function TeamsPage() {
  const [teams, setTeams] = useState<unknown[]>([]);

  const load = useCallback(async () => {
    const h = encodeURIComponent(getHackathon());
    const res = await fetch(`/api/teams?hackathon=${h}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setTeams(data.teams);
  }, []);

  useEffect(() => {
    void load();
    const onH = () => void load();
    window.addEventListener("hackmate:hackathon", onH);
    return () => window.removeEventListener("hackmate:hackathon", onH);
  }, [load]);

  async function lockTeam(teamId: string) {
    await fetch(`/api/teams/${teamId}/lock`, { method: "POST", credentials: "include" });
    await load();
  }

  async function finalize() {
    const hackathonName = getHackathon();
    if (!confirm("Finalize all suggested/locked teams for this hackathon?")) return;
    await fetch("/api/teams/finalize", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hackathonName }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-[var(--muted)]">Suggested groups · max 5 people · organizer edits via API PATCH.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
            onClick={() => void finalize()}
          >
            Finalize all
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((t) => {
          const team = t as {
            id: string;
            teamName: string;
            projectTitle: string | null;
            matchScore: number | null;
            reason: string | null;
            risks: unknown;
            locked: boolean;
            status: string;
            members: Array<{
              participant: { fullName: string; email: string; profile: { skills: unknown } | null };
              suggestedRole: string | null;
            }>;
          };
          return (
            <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{team.teamName}</div>
                  <div className="text-sm text-[var(--muted)]">{team.projectTitle}</div>
                </div>
                <div className="text-right text-xs text-[var(--muted)]">
                  <div>score {team.matchScore ?? "—"}</div>
                  <div>{team.members.length}/5</div>
                  <div className="mt-1">{team.status}</div>
                </div>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {team.members.map((m) => (
                  <li key={m.participant.email} className="flex justify-between gap-2 border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                    <span className="font-medium">{m.participant.fullName}</span>
                    <span className="text-[var(--muted)]">{m.suggestedRole}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--muted)]">{team.reason}</p>
              {!team.locked ? (
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => void lockTeam(team.id)}
                >
                  Lock team
                </button>
              ) : (
                <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">Locked</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
