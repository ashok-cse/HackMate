"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "hackmate_hackathon";
const CUSTOM_UI_KEY = "hackmate_hackathon_custom_ui";

const CUSTOM = "__hackmate_other__";

type EventRow = { id: string; title: string };

function syncCustomFlag(on: boolean) {
  if (on) window.sessionStorage.setItem(CUSTOM_UI_KEY, "1");
  else window.sessionStorage.removeItem(CUSTOM_UI_KEY);
}

/** Call from event manage so dashboard lists/campaign scope match `Participant.hackathonName` (event title). */
export function syncDashboardHackathonFromEvent(title: string) {
  if (typeof window === "undefined") return;
  const t = title.trim();
  if (!t) return;
  syncCustomFlag(false);
  window.sessionStorage.setItem(STORAGE_KEY, t);
  window.dispatchEvent(new Event("hackmate:hackathon"));
}

export function HackathonFilter() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hackathonKey, setHackathonKey] = useState("");
  const [manualScope, setManualScope] = useState(false);

  const bump = () => window.dispatchEvent(new Event("hackmate:hackathon"));

  /** After events load or key changes — treat unknown names as manual scope unless flag cleared. */
  const reconcileManualScope = useCallback(
    (evs: EventRow[]) => {
      const key = (window.sessionStorage.getItem(STORAGE_KEY) ?? "").trim();
      if (!key) {
        syncCustomFlag(window.sessionStorage.getItem(CUSTOM_UI_KEY) === "1");
        setManualScope(window.sessionStorage.getItem(CUSTOM_UI_KEY) === "1");
        return;
      }
      const inList = evs.some((e) => e.title === key);
      if (window.sessionStorage.getItem(CUSTOM_UI_KEY) === "1") {
        setManualScope(true);
        return;
      }
      setManualScope(!inList);
      if (!inList) syncCustomFlag(true);
    },
    [],
  );

  useEffect(() => {
    queueMicrotask(() => {
      const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
      setHackathonKey(raw.trim());
      setManualScope(window.sessionStorage.getItem(CUSTOM_UI_KEY) === "1");
    });

    void (async () => {
      const res = await fetch("/api/events", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const rows = (data.events as EventRow[])
          .map((e) => ({ id: e.id, title: e.title.trim() }))
          .filter((e) => e.title.length > 0)
          .sort((a, b) => a.title.localeCompare(b.title));
        setEvents(rows);
        queueMicrotask(() => reconcileManualScope(rows));
      }
      setLoaded(true);
    })();
  }, [reconcileManualScope]);

  useEffect(() => {
    const onExternal = () => {
      queueMicrotask(() => {
        const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
        setHackathonKey(raw.trim());
        setManualScope(window.sessionStorage.getItem(CUSTOM_UI_KEY) === "1");
      });
    };
    window.addEventListener("hackmate:hackathon", onExternal);
    return () => window.removeEventListener("hackmate:hackathon", onExternal);
  }, []);

  function scopeAllHackathons() {
    syncCustomFlag(false);
    window.sessionStorage.setItem(STORAGE_KEY, "");
    setHackathonKey("");
    setManualScope(false);
    bump();
  }

  function scopeByEventTitle(title: string) {
    syncCustomFlag(false);
    window.sessionStorage.setItem(STORAGE_KEY, title.trim());
    setHackathonKey(title.trim());
    setManualScope(false);
    bump();
  }

  /** Empty key + typing flow from nav bar. */
  function scopeManualTyping(next: string) {
    syncCustomFlag(true);
    window.sessionStorage.setItem(STORAGE_KEY, next.trim());
    setHackathonKey(next.trim());
    setManualScope(true);
    bump();
  }

  function openManualEmpty() {
    syncCustomFlag(true);
    window.sessionStorage.setItem(STORAGE_KEY, "");
    setHackathonKey("");
    setManualScope(true);
    bump();
  }

  const inList =
    hackathonKey.length > 0 && events.some((e) => e.title === hackathonKey);
  const selectValue =
    !loaded
      ? ""
      : hackathonKey === "" && !manualScope
        ? ""
        : manualScope
          ? CUSTOM
          : inList
            ? hackathonKey
            : CUSTOM;

  return (
    <div className="flex flex-wrap items-center gap-2 gap-y-2 text-sm">
      <label className="shrink-0 text-[var(--muted)]">Hackathon</label>
      <select
        className="min-w-[10rem] max-w-[min(24rem,calc(100vw-12rem))] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 outline-none ring-emerald-500/30 focus:ring-2"
        disabled={!loaded}
        value={selectValue}
        title="Scopes dashboard stats and lists by Participant.hackathonName (normally the promoted event title)"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") scopeAllHackathons();
          else if (v === CUSTOM) openManualEmpty();
          else scopeByEventTitle(v);
        }}
      >
        {!loaded ? <option value="">Loading events…</option> : null}
        {loaded ? <option value="">All hackathons (workspace totals)</option> : null}
        {events.map((ev) => (
          <option key={ev.id} value={ev.title}>
            {ev.title}
          </option>
        ))}
        {loaded ? (
          <option value={CUSTOM}>Other name… (CSV / not listed)</option>
        ) : null}
      </select>
      {manualScope ? (
        <input
          className="min-w-[8rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none ring-emerald-500/30 focus:ring-2 sm:max-w-xs"
          value={hackathonKey}
          onChange={(e) => scopeManualTyping(e.target.value)}
          placeholder="Exact hackathon_name"
          aria-label="Exact hackathon name"
        />
      ) : null}
    </div>
  );
}

export function getHackathon(): string {
  if (typeof window === "undefined") return "";
  return (window.sessionStorage.getItem(STORAGE_KEY) ?? "").trim();
}
