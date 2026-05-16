"use client";

import { useCallback, useEffect, useState } from "react";
import { getHackathon } from "@/components/HackathonFilter";

type Stats = {
  totalParticipants: number;
  callsCompleted: number;
  callsPending: number;
  noAnswer: number;
  consentDeclined: number;
  profilesExtracted: number;
  needsManual: number;
  teamsGenerated: number;
  unmatchedParticipants: number;
  campaignPaused: boolean;
};

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const h = encodeURIComponent(getHackathon());
    const res = await fetch(`/api/stats?hackathon=${h}`, { credentials: "include" });
    if (!res.ok) return;
    setStats(await res.json());
  }, []);

  useEffect(() => {
    void load();
    const onH = () => void load();
    window.addEventListener("hackmate:hackathon", onH);
    return () => window.removeEventListener("hackmate:hackathon", onH);
  }, [load]);

  async function campaign(action: "start" | "pause") {
    const hackathonName = getHackathon();
    const url = action === "start" ? "/api/campaigns/start" : "/api/campaigns/pause";
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hackathonName }),
    });
    if (!res.ok) alert(await res.text());
    await load();
  }

  async function generateTeams() {
    const hackathonName = getHackathon();
    const res = await fetch("/api/matching/generate", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hackathonName }),
    });
    if (!res.ok) alert(await res.text());
    await load();
  }

  const cards = stats
    ? [
        ["Participants", stats.totalParticipants],
        ["Calls completed", stats.callsCompleted],
        ["Calls pending", stats.callsPending],
        ["No answer", stats.noAnswer],
        ["Consent declined", stats.consentDeclined],
        ["Profiles ready", stats.profilesExtracted],
        ["Needs manual review", stats.needsManual],
        ["Suggested teams", stats.teamsGenerated],
        ["Unmatched (post-call)", stats.unmatchedParticipants],
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Monitor calling progress, extraction health, and matching output.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          onClick={() => void campaign("start")}
        >
          Start campaign
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => void campaign("pause")}
        >
          Pause campaign
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => void generateTeams()}
        >
          Generate teams
        </button>
      </div>

      {stats?.campaignPaused ? (
        <p className="text-sm text-amber-600">Campaign is paused — outbound queue should stop.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {label}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{val as number}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
