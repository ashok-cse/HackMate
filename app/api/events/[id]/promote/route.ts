import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const pending = await prisma.eventRegistration.findMany({
    where: { eventId: id, promotedParticipantId: null },
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
      },
    });

    await prisma.eventRegistration.update({
      where: { id: r.id },
      data: { promotedParticipantId: participant.id },
    });
    promoted++;
  }

  const unpromotedRemaining = await prisma.eventRegistration.count({
    where: { eventId: id, promotedParticipantId: null },
  });

  return NextResponse.json({
    promoted,
    skippedDuplicateEmail,
    skippedNoConsent,
    unpromotedRemaining,
  });
}
