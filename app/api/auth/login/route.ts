import { NextResponse } from "next/server";
import { adminToken } from "@/lib/auth";

export async function POST(req: Request) {
  const expected = adminToken();
  if (!expected) {
    return NextResponse.json(
      { error: "Set HACKMATE_ADMIN_TOKEN in .env to enable login." },
      { status: 501 },
    );
  }

  const body = (await req.json()) as { token?: string };
  if (body.token !== expected) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("hackmate_token", expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
