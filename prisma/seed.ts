import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Ensures global settings exist. Create hackathons via Dashboard → Events (no bundled demo roster). */
async function main() {
  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global", campaignPaused: false },
    update: {},
  });

  console.log("Seed complete: app settings only. Add events from the organizer dashboard.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
