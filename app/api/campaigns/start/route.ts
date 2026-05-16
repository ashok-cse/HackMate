import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setHackathonCampaignPaused } from "@/lib/hackathon-campaign";
import { hackmateServerLog, truncateForStderrLog } from "@/lib/server-log";
import { dispatchSlngCall, slngConfigured } from "@/lib/slng";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    hackmateServerLog("hackmate:campaigns:start", "Missing hackathonName", {}, "warn");
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  const slngReady = slngConfigured();
  hackmateServerLog("hackmate:campaigns:start", "Begin", {
    hackathonName,
    slngConfigured: slngReady,
  });

  await setHackathonCampaignPaused(prisma, hackathonName, false);

  const where = {
    hackathonName,
    consentToCall: true,
    callStatus: {
      notIn: ["completed", "consent_declined", "calling"],
    },
  };

  if (!slngReady) {
    const result = await prisma.participant.updateMany({
      where,
      data: { callStatus: "queued" },
    });

    hackmateServerLog("hackmate:campaigns:start", "Queued locally (SLNG not configured)", {
      hackathonName,
      updated: result.count,
    });

    return NextResponse.json({
      queued: result.count,
      dispatched: 0,
      failed: 0,
      note: "Queued locally. Set SLNG_API_KEY and SLNG_AGENT_ID to dispatch outbound calls.",
    });
  }

  const participants = await prisma.participant.findMany({
    where,
  });

  hackmateServerLog("hackmate:campaigns:start", "Dispatching SLNG", {
    hackathonName,
    batchSize: participants.length,
  });

  let dispatched = 0;
  let failed = 0;

  for (const participant of participants) {
    const result = await dispatchSlngCall(participant);
    if (result.ok) {
      await prisma.$transaction([
        prisma.call.create({
          data: {
            participantId: participant.id,
            provider: "slng",
            providerCallId: result.callId,
            status: "dispatched",
            rawPayload: {
              dispatch: {
                apiBase: result.apiBase,
                message: result.message ?? null,
              },
            },
          },
        }),
        prisma.participant.update({
          where: { id: participant.id },
          data: { callStatus: "calling" },
        }),
      ]);
      dispatched++;
    } else {
      hackmateServerLog(
        "hackmate:campaigns:start",
        "Dispatch failed",
        {
          participantId: participant.id,
          reason: result.reason,
          message: result.message,
          httpStatus: "status" in result ? result.status : undefined,
          slngApiBase: !result.ok && "apiBase" in result ? result.apiBase : undefined,
          slngBodySnippet:
            !result.ok && "detail" in result
              ? truncateForStderrLog(result.detail)
              : undefined,
        },
        "warn",
      );
      await prisma.$transaction([
        prisma.call.create({
          data: {
            participantId: participant.id,
            provider: "slng",
            status: "dispatch_failed",
            rawPayload: { dispatchError: result },
          },
        }),
        prisma.participant.update({
          where: { id: participant.id },
          data: { callStatus: "failed" },
        }),
      ]);
      failed++;
    }
  }

  hackmateServerLog("hackmate:campaigns:start", "Done", {
    hackathonName,
    batchSize: participants.length,
    dispatched,
    failed,
  });

  return NextResponse.json({
    queued: 0,
    dispatched,
    failed,
  });
}
