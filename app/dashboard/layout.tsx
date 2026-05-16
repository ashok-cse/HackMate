import type { ReactNode } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { HackathonFilter } from "@/components/HackathonFilter";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
          <HackathonFilter />
          <p className="text-xs text-[var(--muted)]">
            Voice matching MVP · SLNG webhook + Pioneer-ready extraction
          </p>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
