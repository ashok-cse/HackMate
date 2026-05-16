"use client";

import { HackMateLogo } from "@/components/HackMateLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "Events" },
  { href: "/dashboard/upload", label: "CSV upload" },
  { href: "/dashboard/participants", label: "Participants" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/unmatched", label: "Unmatched" },
  { href: "/dashboard/export", label: "Export" },
];

function linkClass(active: boolean, compact: boolean) {
  const base = compact
    ? "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition"
    : "rounded-lg px-3 py-2 text-sm transition";
  return `${base} ${
    active
      ? "bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300"
      : "text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5"
  }`;
}

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile / tablet: horizontal menu (sidebar was hidden below md — nothing was reachable) */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] md:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="HackMate home"
          >
            <HackMateLogo size={36} className="drop-shadow-sm" />
          </Link>
          <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-600">
            Menu
          </div>
          <nav className="flex min-h-[44px] flex-1 items-center gap-1 overflow-x-auto pb-1">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link key={l.href} href={l.href} className={linkClass(active, true)}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--card)] p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-3 rounded-xl p-1 hover:bg-black/5 dark:hover:bg-white/5">
          <HackMateLogo size={44} className="drop-shadow-sm" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">HackMate</div>
            <div className="text-lg font-semibold leading-tight">Organizer</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} className={linkClass(active, false)}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
