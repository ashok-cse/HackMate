import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setHackathonCampaignPaused } from "@/lib/hackathon-campaign";
import { hackmateServerLog, truncateForStderrLog } from "@/lib/server-log";
import {
  dispatchOutboundPhone,
  outboundPhoneConfigured,
  outboundPhoneProvider,
} from "@/lib/outbound-phone";

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

  const phoneReady = outboundPhoneConfigured();
  const phoneProvider = outboundPhoneProvider();
  hackmateServerLog("hackmate:campaigns:start", "Begin", {
    hackathonName,
    phoneProvider: phoneProvider ?? "none",
    phoneConfigured: phoneReady,
  });

  await setHackathonCampaignPaused(prisma, hackathonName, false);

  const where = {
    hackathonName,
    consentToCall: true,
    callStatus: {
      notIn: ["completed", "consent_declined", "calling"],
    },
  };

  if (!phoneReady) {
    const result = await prisma.participant.updateMany({
      where,
      data: { callStatus: "queued" },
    });

    hackmateServerLog("hackmate:campaigns:start", "Queued locally (no phone provider)", {
      hackathonName,
      updated: result.count,
    });

    return NextResponse.json({
      queued: result.count,
      dispatched: 0,
      failed: 0,
      note: "Queued locally. Configure Retell (RETELL_API_KEY, RETELL_FROM_NUMBER) or SLNG (SLNG_API_KEY, SLNG_AGENT_ID); optional PHONE_VOICE_PROVIDER=retell|slng|auto.",
    });
  }

  const participants = await prisma.participant.findMany({
    where,
  });

  hackmateServerLog("hackmate:campaigns:start", "Dispatching outbound calls", {
    hackathonName,
    batchSize: participants.length,
    provider: phoneProvider,
  });

  let dispatched = 0;
  let failed = 0;

  for (const participant of participants) {
    const result = await dispatchOutboundPhone(participant);
    if (result.ok) {
      await prisma.$transaction([
        prisma.call.create({
          data: {
            participantId: participant.id,
            provider: result.provider,
            providerCallId: result.callId,
            status: "dispatched",
            rawPayload: {
              dispatch: {
                provider: result.provider,
                apiBase: result.apiBase ?? null,
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
          apiBase: !result.ok && "apiBase" in result ? result.apiBase : undefined,
          bodySnippet:
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
            provider: result.provider ?? phoneProvider ?? "slng",
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
