"use client";

import { getHackathon } from "@/components/HackathonFilter";

async function download(kind: string) {
  const h = encodeURIComponent(getHackathon());
  const res = await fetch(`/api/export/${kind}?hackathon=${h}`, { credentials: "include" });
  if (!res.ok) {
    alert(await res.text());
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-[var(--muted)]">CSV downloads scoped to the hackathon filter.</p>
      </div>
      <div className="flex flex-col gap-3">
        {[
          ["final-teams", "Final teams"],
          ["participants", "Participants + profiles"],
          ["unmatched", "Unmatched / attention"],
          ["calls", "Call log"],
        ].map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => void download(kind)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
