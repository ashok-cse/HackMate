"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "hackmate_hackathon";

export function HackathonFilter() {
  const defaultName = process.env.NEXT_PUBLIC_DEFAULT_HACKATHON ?? "Tech Europe Demo";
  const [value, setValue] = useState(defaultName);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved) setValue(saved);
    else window.sessionStorage.setItem(STORAGE_KEY, defaultName);
  }, [defaultName]);

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
      />
    </div>
  );
}

export function getHackathon(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_DEFAULT_HACKATHON ?? "";
  return (
    window.sessionStorage.getItem(STORAGE_KEY) ??
    process.env.NEXT_PUBLIC_DEFAULT_HACKATHON ??
    ""
  );
}
