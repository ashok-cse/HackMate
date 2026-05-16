import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: { hackathonName, status: { in: ["suggested", "locked"] } },
    include: { members: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const team of teams) {
      await tx.team.update({
        where: { id: team.id },
        data: { status: "final", locked: true },
      });
      for (const m of team.members) {
        await tx.participant.update({
          where: { id: m.participantId },
          data: { finalTeamId: team.id },
        });
      }
    }
  });

  return NextResponse.json({ finalized: teams.length });
}
