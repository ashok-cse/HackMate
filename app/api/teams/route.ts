import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const hackathon = searchParams.get("hackathon");

  const teams = await prisma.team.findMany({
    where: hackathon ? { hackathonName: hackathon } : undefined,
    include: {
      members: { include: { participant: { include: { profile: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ teams });
}
