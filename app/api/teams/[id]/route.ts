import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_TEAM } from "@/lib/matching";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { include: { participant: { include: { profile: true } } } } },
  });

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ team });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const body = (await req.json()) as {
    teamName?: string;
    projectTitle?: string;
    projectSummary?: string;
    reason?: string;
    organizerNotes?: string;
    addParticipantId?: string;
    removeParticipantId?: string;
    moveParticipantId?: string;
    moveToTeamId?: string;
  };

  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: true },
  });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (team.locked) {
    return NextResponse.json({ error: "Team is locked" }, { status: 400 });
  }

  if (body.moveParticipantId && body.moveToTeamId) {
    const member = await prisma.teamMember.findUnique({
      where: { participantId: body.moveParticipantId },
    });
    if (!member || member.teamId !== id) {
      return NextResponse.json({ error: "Participant not in this team" }, { status: 400 });
    }
    const target = await prisma.team.findUnique({
      where: { id: body.moveToTeamId },
      include: { members: true },
    });
    if (!target) return NextResponse.json({ error: "Target team not found" }, { status: 404 });
    if (target.members.length >= MAX_TEAM) {
      return NextResponse.json({ error: "Target team full" }, { status: 400 });
    }
    await prisma.teamMember.update({
      where: { participantId: body.moveParticipantId },
      data: { teamId: body.moveToTeamId },
    });
  }

  if (body.removeParticipantId) {
    await prisma.teamMember.deleteMany({
      where: { teamId: id, participantId: body.removeParticipantId },
    });
  }

  if (body.addParticipantId) {
    const count = await prisma.teamMember.count({ where: { teamId: id } });
    if (count >= MAX_TEAM) {
      return NextResponse.json({ error: "Team full (max 5)" }, { status: 400 });
    }
    const existing = await prisma.teamMember.findUnique({
      where: { participantId: body.addParticipantId },
    });
    if (existing && existing.teamId !== id) {
      return NextResponse.json({ error: "Participant already on another team" }, { status: 400 });
    }
    if (!existing) {
      await prisma.teamMember.create({
        data: {
          teamId: id,
          participantId: body.addParticipantId,
          source: "organizer",
        },
      });
    }
  }

  await prisma.team.update({
    where: { id },
    data: {
      teamName: body.teamName ?? undefined,
      projectTitle: body.projectTitle ?? undefined,
      projectSummary: body.projectSummary ?? undefined,
      reason: body.reason ?? undefined,
      organizerNotes: body.organizerNotes ?? undefined,
    },
  });

  const updated = await prisma.team.findUnique({
    where: { id },
    include: { members: { include: { participant: { include: { profile: true } } } } },
  });

  return NextResponse.json({ team: updated });
}
