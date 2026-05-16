import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setHackathonCampaignPaused } from "@/lib/hackathon-campaign";
import { dispatchSlngCall, slngConfigured } from "@/lib/slng";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    console.warn("[hackmate:campaigns:start] Missing hackathonName");
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  const slngReady = slngConfigured();
  console.info("[hackmate:campaigns:start] Begin", { hackathonName, slngConfigured: slngReady });

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

    console.info("[hackmate:campaigns:start] Queued locally (SLNG not configured)", {
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

  console.info("[hackmate:campaigns:start] Dispatching SLNG", {
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
      console.warn("[hackmate:campaigns:start] Dispatch failed", {
        participantId: participant.id,
        reason: result.reason,
        message: result.message,
        httpStatus: "status" in result ? result.status : undefined,
      });
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

  console.info("[hackmate:campaigns:start] Done", {
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
