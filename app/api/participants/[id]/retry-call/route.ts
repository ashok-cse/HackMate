import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isHackathonCampaignPaused } from "@/lib/hackathon-campaign";
import { dispatchOutboundPhone, outboundPhoneConfigured } from "@/lib/outbound-phone";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const participant = await prisma.participant.findUnique({ where: { id } });
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!participant.consentToCall) {
    return NextResponse.json({ error: "Participant did not consent to calls" }, { status: 400 });
  }

  if (await isHackathonCampaignPaused(prisma, participant.hackathonName)) {
    return NextResponse.json(
      { error: "Campaign is paused for this hackathon" },
      { status: 400 },
    );
  }

  if (!outboundPhoneConfigured()) {
    await prisma.participant.update({
      where: { id },
      data: { callStatus: "queued" },
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      message:
        "Marked queued. Set Retell (RETELL_API_KEY, RETELL_FROM_NUMBER) or SLNG (SLNG_API_KEY, SLNG_AGENT_ID).",
    });
  }

  const result = await dispatchOutboundPhone(participant);
  if (!result.ok) {
    await prisma.$transaction([
      prisma.call.create({
        data: {
          participantId: participant.id,
          provider: result.provider ?? "slng",
          status: "dispatch_failed",
          rawPayload: { dispatchError: result },
        },
      }),
      prisma.participant.update({
        where: { id },
        data: { callStatus: "failed" },
      }),
    ]);

    return NextResponse.json(result, {
      status: result.reason === "invalid_phone" ? 400 : 502,
    });
  }

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
      where: { id },
      data: { callStatus: "calling" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    queued: false,
    callId: result.callId,
    message: result.message ?? `Call dispatched (${result.provider}).`,
  });
}
