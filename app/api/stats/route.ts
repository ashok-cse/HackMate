import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hackmateServerLog } from "@/lib/server-log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const hackathon = searchParams.get("hackathon")?.trim() || undefined;

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
    campaignSettingsRow,
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
    hackathon
      ? prisma.hackathonCampaignSettings.findUnique({ where: { hackathonName: hackathon } })
      : Promise.resolve(null),
  ]);

  const campaignPaused = hackathon ? (campaignSettingsRow?.campaignPaused ?? false) : false;

  hackmateServerLog("hackmate:stats", "Snapshot", {
    hackathonScope: hackathon ?? "(all hackathons)",
    totalParticipants,
    callsCompleted,
    callsPending,
    noAnswer,
    consentDeclined,
    profilesReady: profilesExtracted,
    needsManualReview: needsManual,
    suggestedTeams: teamsGenerated,
    unmatchedPostCall: unmatchedParticipants,
    campaignPaused,
  });

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
    campaignPaused,
  });
}
