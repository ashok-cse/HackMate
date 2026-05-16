import { prisma } from "@/lib/prisma";

export async function participantForVoiceLink(slug: string, token: string) {
  const participant = await prisma.participant.findFirst({
    where: { voiceInviteToken: token.trim() },
    include: { event: true },
  });
  if (!participant?.event || participant.event.slug !== slug) {
    return null;
  }
  return participant;
}
