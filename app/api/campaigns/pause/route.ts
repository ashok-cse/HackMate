import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global", campaignPaused: true },
    update: { campaignPaused: true },
  });

  return NextResponse.json({ ok: true, paused: true });
}
