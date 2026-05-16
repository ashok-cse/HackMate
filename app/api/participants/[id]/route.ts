import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const participant = await prisma.participant.findUnique({
    where: { id },
    include: {
      profile: true,
      calls: { orderBy: { createdAt: "desc" }, take: 5 },
      teamMemberships: { include: { team: true } },
    },
  });

  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ participant });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    organizerNotes?: string;
    profileStatus?: string;
    callStatus?: string;
    profile?: Record<string, unknown>;
  };

  const participantUpdate: Record<string, unknown> = {};
  if (body.organizerNotes !== undefined) participantUpdate.organizerNotes = body.organizerNotes;
  if (body.profileStatus !== undefined) participantUpdate.profileStatus = body.profileStatus;
  if (body.callStatus !== undefined) participantUpdate.callStatus = body.callStatus;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(participantUpdate).length) {
      await tx.participant.update({ where: { id }, data: participantUpdate });
    }
    if (body.profile) {
      const p = body.profile;
      await tx.participantProfile.upsert({
        where: { participantId: id },
        create: {
          participantId: id,
          skills: (p.skills as object) ?? [],
          primaryRole: (p.primaryRole as string) ?? null,
          strongestSkill: (p.strongestSkill as string) ?? null,
          experienceLevel: (p.experienceLevel as string) ?? null,
          projectIdea: (p.projectIdea as string) ?? null,
          ideaSummary: (p.ideaSummary as string) ?? null,
          domainInterests: (p.domainInterests as object) ?? [],
          wantsToLead: (p.wantsToLead as boolean) ?? null,
          openToJoinOtherTeam: (p.openToJoinOtherTeam as boolean) ?? null,
          preferredTeamSize: (p.preferredTeamSize as number) ?? null,
          neededTeammates: (p.neededTeammates as object) ?? [],
          availability: (p.availability as string) ?? null,
          existingTeamStatus: (p.existingTeamStatus as string) ?? null,
          confidenceScore: (p.confidenceScore as number) ?? null,
          missingFields: (p.missingFields as object) ?? [],
          extractionNotes: (p.extractionNotes as string) ?? null,
        },
        update: {
          skills: (p.skills as object) ?? undefined,
          primaryRole: (p.primaryRole as string) ?? undefined,
          strongestSkill: (p.strongestSkill as string) ?? undefined,
          experienceLevel: (p.experienceLevel as string) ?? undefined,
          projectIdea: (p.projectIdea as string) ?? undefined,
          ideaSummary: (p.ideaSummary as string) ?? undefined,
          domainInterests: (p.domainInterests as object) ?? undefined,
          wantsToLead: (p.wantsToLead as boolean) ?? undefined,
          openToJoinOtherTeam: (p.openToJoinOtherTeam as boolean) ?? undefined,
          preferredTeamSize: (p.preferredTeamSize as number) ?? undefined,
          neededTeammates: (p.neededTeammates as object) ?? undefined,
          availability: (p.availability as string) ?? undefined,
          existingTeamStatus: (p.existingTeamStatus as string) ?? undefined,
          confidenceScore: (p.confidenceScore as number) ?? undefined,
          missingFields: (p.missingFields as object) ?? undefined,
          extractionNotes: (p.extractionNotes as string) ?? undefined,
        },
      });
    }
  });

  const participant = await prisma.participant.findUnique({
    where: { id },
    include: { profile: true, calls: true },
  });

  return NextResponse.json({ participant });
}
