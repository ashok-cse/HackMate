import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminCookie } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/webhooks")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/login")) return NextResponse.next();
  if (pathname.startsWith("/api/public/")) return NextResponse.next();
  if (pathname.startsWith("/e/")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const token = process.env.HACKMATE_ADMIN_TOKEN;
  if (!token) return NextResponse.next();

  if (pathname.startsWith("/api")) return NextResponse.next();

  if (!verifyAdminCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
