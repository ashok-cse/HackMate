import type { NextRequest } from "next/server";

export function adminToken(): string | undefined {
  return process.env.HACKMATE_ADMIN_TOKEN;
}

/** When HACKMATE_ADMIN_TOKEN is unset, APIs stay open (local dev). */
export function requireAdmin(req: Request): Response | null {
  const expected = adminToken();
  if (!expected) return null;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return null;

  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)hackmate_token=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : undefined;
  if (token === expected) return null;

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export function verifyAdminCookie(req: NextRequest): boolean {
  const expected = adminToken();
  if (!expected) return true;
  return req.cookies.get("hackmate_token")?.value === expected;
}
