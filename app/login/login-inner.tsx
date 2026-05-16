"use client";

import { HackMateLogo } from "@/components/HackMateLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-lg shadow-black/5">
        <div className="flex items-center gap-4">
          <HackMateLogo size={56} className="drop-shadow-md" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">HackMate</h1>
            <p className="text-sm text-[var(--muted)]">Organizer sign-in</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Enter the admin token from your environment.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Admin token
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              placeholder="Type 'admin' to login"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
