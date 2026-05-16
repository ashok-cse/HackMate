import type { PrismaClient } from "@prisma/client";

export async function isHackathonCampaignPaused(
  prisma: PrismaClient,
  hackathonName: string,
): Promise<boolean> {
  const row = await prisma.hackathonCampaignSettings.findUnique({
    where: { hackathonName },
  });
  return row?.campaignPaused ?? false;
}

export async function setHackathonCampaignPaused(
  prisma: PrismaClient,
  hackathonName: string,
  paused: boolean,
): Promise<void> {
  await prisma.hackathonCampaignSettings.upsert({
    where: { hackathonName },
    create: { hackathonName, campaignPaused: paused },
    update: { campaignPaused: paused },
  });
}
