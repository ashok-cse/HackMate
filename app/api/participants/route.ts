import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const hackathon = searchParams.get("hackathon");

  const participants = await prisma.participant.findMany({
    where: hackathon ? { hackathonName: hackathon } : undefined,
    include: {
      profile: true,
      teamMemberships: { include: { team: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ participants });
}
