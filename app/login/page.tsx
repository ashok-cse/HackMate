import { Suspense } from "react";
import LoginInner from "./login-inner";

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="p-10 text-center text-sm text-[var(--muted)]">Loading…</div>}
    >
      <LoginInner />
    </Suspense>
  );
}
