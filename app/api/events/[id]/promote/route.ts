import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendParticipantPromotedEmail } from "@/lib/resend-promoted-email";
import { hackmateServerLog } from "@/lib/server-log";
import { newVoiceInviteToken } from "@/lib/voice-invite-token";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const pending = await prisma.eventRegistration.findMany({
    where: { eventId: id, promotedParticipantId: null },
  });

  hackmateServerLog("hackmate:promote", "Begin", {
    eventId: id,
    eventTitle: event.title,
    pendingRegistrationCount: pending.length,
  });

  let promoted = 0;
  let skippedDuplicateEmail = 0;
  let skippedNoConsent = 0;

  for (const r of pending) {
    if (!r.consentToCall) {
      skippedNoConsent++;
      continue;
    }
    const email = r.email.trim().toLowerCase();
    const existing = await prisma.participant.findUnique({ where: { email } });
    if (existing) {
      skippedDuplicateEmail++;
      continue;
    }

    const voiceInviteToken = newVoiceInviteToken();
    const participant = await prisma.participant.create({
      data: {
        externalRegistrationId: r.id,
        fullName: r.fullName,
        email,
        phone: r.phone.trim(),
        city: r.city?.trim() || null,
        hackathonName: event.title,
        universityOrCompany: r.universityOrCompany?.trim() || null,
        registrationType: r.registrationType?.trim() || null,
        knownSkills: r.knownSkills?.trim() || null,
        existingTeamName: r.existingTeamName?.trim() || null,
        notes: r.notes?.trim() || null,
        consentToCall: true,
        eventId: event.id,
        voiceInviteToken,
      },
    });

    await prisma.eventRegistration.update({
      where: { id: r.id },
      data: { promotedParticipantId: participant.id },
    });
    await sendParticipantPromotedEmail({
      to: email,
      fullName: r.fullName,
      eventTitle: event.title,
      eventSlug: event.slug,
      voiceInviteToken,
    });
    promoted++;
  }

  const unpromotedRemaining = await prisma.eventRegistration.count({
    where: { eventId: id, promotedParticipantId: null },
  });

  hackmateServerLog("hackmate:promote", "Done", {
    eventId: id,
    eventTitle: event.title,
    promoted,
    skippedDuplicateEmail,
    skippedNoConsent,
    unpromotedRemaining,
  });

  return NextResponse.json({
    promoted,
    skippedDuplicateEmail,
    skippedNoConsent,
    unpromotedRemaining,
  });
}
