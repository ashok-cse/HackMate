import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const hackathon = searchParams.get("hackathon") ?? undefined;

  const whereHack = hackathon ? { hackathonName: hackathon } : {};

  const [
    totalParticipants,
    callsCompleted,
    callsPending,
    noAnswer,
    consentDeclined,
    profilesExtracted,
    needsManual,
    teamsGenerated,
    unmatchedParticipants,
    settings,
  ] = await Promise.all([
    prisma.participant.count({ where: whereHack }),
    prisma.participant.count({
      where: { ...whereHack, callStatus: "completed" },
    }),
    prisma.participant.count({
      where: {
        ...whereHack,
        callStatus: { in: ["queued", "calling", "not_queued"] },
      },
    }),
    prisma.participant.count({ where: { ...whereHack, callStatus: "no_answer" } }),
    prisma.participant.count({
      where: { ...whereHack, callStatus: "consent_declined" },
    }),
    prisma.participant.count({
      where: { ...whereHack, profileStatus: "ready" },
    }),
    prisma.participant.count({
      where: { ...whereHack, profileStatus: "needs_manual_review" },
    }),
    prisma.team.count({
      where: {
        ...whereHack,
        status: { in: ["suggested", "locked"] },
      },
    }),
    prisma.participant.count({
      where: {
        ...whereHack,
        teamMemberships: { none: {} },
        callStatus: "completed",
      },
    }),
    prisma.appSettings.findUnique({ where: { id: "global" } }),
  ]);

  return NextResponse.json({
    totalParticipants,
    callsCompleted,
    callsPending,
    noAnswer,
    consentDeclined,
    profilesExtracted,
    needsManual,
    teamsGenerated,
    unmatchedParticipants,
    campaignPaused: settings?.campaignPaused ?? false,
  });
}
