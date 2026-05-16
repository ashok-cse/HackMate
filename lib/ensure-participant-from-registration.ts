import { prisma } from "@/lib/prisma";
import { sendParticipantPromotedEmail } from "@/lib/resend-promoted-email";

/** Ensures an EventRegistration is linked to a Participant (same rules as batch promote). */
export async function ensureParticipantFromRegistration(registrationId: string, expectedSlug: string) {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { event: true },
  });

  if (!reg) {
    return { error: "registration_not_found" as const };
  }
  if (reg.event.slug !== expectedSlug) {
    return { error: "event_mismatch" as const };
  }
  if (!reg.consentToCall) {
    return { error: "no_consent" as const };
  }

  if (reg.promotedParticipantId) {
    return { participantId: reg.promotedParticipantId };
  }

  const email = reg.email.trim().toLowerCase();
  const existing = await prisma.participant.findUnique({ where: { email } });

  if (existing) {
    const sameEvent =
      existing.eventId === reg.eventId ||
      (!existing.eventId && existing.hackathonName === reg.event.title);
    if (sameEvent) {
      await prisma.eventRegistration.update({
        where: { id: reg.id },
        data: { promotedParticipantId: existing.id },
      });
      return { participantId: existing.id };
    }
    return { error: "email_conflict" as const };
  }

  const participant = await prisma.participant.create({
    data: {
      externalRegistrationId: reg.id,
      fullName: reg.fullName,
      email,
      phone: reg.phone.trim(),
      city: reg.city?.trim() || null,
      hackathonName: reg.event.title,
      universityOrCompany: reg.universityOrCompany?.trim() || null,
      registrationType: reg.registrationType?.trim() || null,
      knownSkills: reg.knownSkills?.trim() || null,
      existingTeamName: reg.existingTeamName?.trim() || null,
      notes: reg.notes?.trim() || null,
      consentToCall: true,
      eventId: reg.event.id,
    },
  });

  await prisma.eventRegistration.update({
    where: { id: reg.id },
    data: { promotedParticipantId: participant.id },
  });

  void sendParticipantPromotedEmail({
    to: email,
    fullName: reg.fullName,
    eventTitle: reg.event.title,
    eventSlug: reg.event.slug,
  });

  return { participantId: participant.id };
}
