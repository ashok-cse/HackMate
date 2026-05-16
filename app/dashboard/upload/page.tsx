"use client";

import { useState } from "react";

export default function UploadPage() {
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/participants/upload-csv", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.errors?.join("\n") ?? JSON.stringify(data));
      return;
    }
    setMsg(`Imported ${data.created} created, ${data.updated} updated. Warnings: ${data.warnings?.length ?? 0}`);
    e.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload participants</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          CSV must include: participant_id, full_name, email, phone, city, hackathon_name,
          consent_to_call.
        </p>
      </div>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
      >
        <input name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Upload CSV
        </button>
      </form>
      {msg ? (
        <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-black/5 p-3 text-xs dark:bg-white/5">
          {msg}
        </pre>
      ) : null}
    </div>
  );
}
