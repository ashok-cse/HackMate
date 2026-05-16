"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "hackmate_hackathon";

const envDefaultHackathon = process.env.NEXT_PUBLIC_DEFAULT_HACKATHON?.trim() ?? "";

/** Call from event manage so dashboard lists/campaign scope match `Participant.hackathonName` (event title). */
export function syncDashboardHackathonFromEvent(title: string) {
  if (typeof window === "undefined") return;
  const t = title.trim();
  if (!t) return;
  window.sessionStorage.setItem(STORAGE_KEY, t);
  window.dispatchEvent(new Event("hackmate:hackathon"));
}

export function HackathonFilter() {
  const [value, setValue] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setValue(saved);
        return;
      }
      if (envDefaultHackathon) {
        setValue(envDefaultHackathon);
        window.sessionStorage.setItem(STORAGE_KEY, envDefaultHackathon);
        window.dispatchEvent(new Event("hackmate:hackathon"));
      }
    });
  }, []);

  function persist(next: string) {
    setValue(next);
    window.sessionStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("hackmate:hackathon"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-[var(--muted)]">Hackathon</label>
      <input
        className="min-w-[12rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 outline-none ring-emerald-500/30 focus:ring-2"
        value={value}
        onChange={(e) => persist(e.target.value)}
        placeholder={envDefaultHackathon ? undefined : "Open Events → Manage to sync"}
        title="Matches Participant.hackathonName (usually the event title after promote)"
      />
    </div>
  );
}

export function getHackathon(): string {
  if (typeof window === "undefined") return envDefaultHackathon;
  return (
    window.sessionStorage.getItem(STORAGE_KEY) ??
    envDefaultHackathon
  );
}
