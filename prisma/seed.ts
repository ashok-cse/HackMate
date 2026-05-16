import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HACKATHON = "Tech Europe Demo";

async function main() {
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.call.deleteMany();
  await prisma.participantProfile.deleteMany();
  await prisma.eventRegistration.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.appSettings.deleteMany();

  await prisma.appSettings.create({
    data: { id: "global", campaignPaused: false },
  });

  const demoEvent = await prisma.event.create({
    data: {
      slug: "tech-europe-demo",
      title: HACKATHON,
      description:
        "Seed hackathon. Public signup would live at /e/tech-europe-demo — create your own events from the dashboard.",
      locationSummary: "Berlin · Hybrid",
      registrationOpen: true,
      startsAt: new Date(Date.now() + 86400000 * 14),
      endsAt: new Date(Date.now() + 86400000 * 16),
    },
  });

  const roster = [
    {
      fullName: "Aisha Khan",
      email: "aisha@example.com",
      phone: "+491111111001",
      skills: ["react", "typescript"],
      idea: "Developer productivity CLI",
      domain: ["devtools"],
      lead: true,
      level: "advanced",
    },
    {
      fullName: "Jonas Meier",
      email: "jonas@example.com",
      phone: "+491111111002",
      skills: ["node", "postgres"],
      idea: "Realtime collaboration layer",
      domain: ["devtools"],
      lead: false,
      level: "intermediate",
    },
    {
      fullName: "Sofia Rossi",
      email: "sofia@example.com",
      phone: "+491111111003",
      skills: ["figma", "ui"],
      idea: "",
      domain: ["education"],
      lead: false,
      level: "intermediate",
    },
    {
      fullName: "Marco Silva",
      email: "marco@example.com",
      phone: "+491111111004",
      skills: ["python", "llm"],
      idea: "Voice-first onboarding coach",
      domain: ["ai"],
      lead: true,
      level: "advanced",
    },
    {
      fullName: "Elena Popov",
      email: "elena@example.com",
      phone: "+491111111005",
      skills: ["pitch", "story"],
      idea: "",
      domain: ["ai"],
      lead: false,
      level: "beginner",
    },
    {
      fullName: "Noah Jensen",
      email: "noah@example.com",
      phone: "+491111111006",
      skills: ["docker", "aws"],
      idea: "Carbon-aware scheduling API",
      domain: ["climate"],
      lead: false,
      level: "intermediate",
    },
    {
      fullName: "Fatima Al Sayed",
      email: "fatima@example.com",
      phone: "+491111111007",
      skills: ["flutter"],
      idea: "Neighborhood mutual-aid map",
      domain: ["social"],
      lead: true,
      level: "intermediate",
    },
    {
      fullName: "Liam O'Brien",
      email: "liam@example.com",
      phone: "+491111111008",
      skills: ["spring", "java"],
      idea: "",
      domain: ["fintech"],
      lead: false,
      level: "advanced",
    },
    {
      fullName: "Yuki Tanaka",
      email: "yuki@example.com",
      phone: "+491111111009",
      skills: ["react", "css"],
      idea: "",
      domain: ["health"],
      lead: false,
      level: "beginner",
    },
    {
      fullName: "Oliver Schmidt",
      email: "oliver@example.com",
      phone: "+491111111010",
      skills: ["ml"],
      idea: "Clinical notes summarizer",
      domain: ["health"],
      lead: true,
      level: "advanced",
    },
    {
      fullName: "Zara Haddad",
      email: "zara@example.com",
      phone: "+491111111011",
      skills: ["django"],
      idea: "",
      domain: ["education"],
      lead: false,
      level: "intermediate",
    },
    {
      fullName: "Victor Andersen",
      email: "victor@example.com",
      phone: "+491111111012",
      skills: ["vue"],
      idea: "",
      domain: ["productivity"],
      lead: false,
      level: "intermediate",
    },
  ];

  for (let i = 0; i < roster.length; i++) {
    const r = roster[i];
    const transcript = [
      `assistant: Hi ${r.fullName}, quick questions for ${HACKATHON}.`,
      `user: Hi, sure.`,
      `assistant: Strongest skills?`,
      `user: I work mostly with ${r.skills.join(", ")}.`,
      `assistant: Experience level?`,
      `user: ${r.level}.`,
      `assistant: Project idea?`,
      `user: ${r.idea || "No fixed idea yet — happy to join a team."}`,
      `assistant: Want to lead or join?`,
      `user: ${r.lead ? "Happy to lead." : "Prefer to join."}`,
    ].join("\n");

    const participant = await prisma.participant.create({
      data: {
        externalRegistrationId: `seed-${i + 1}`,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        city: "Berlin",
        hackathonName: HACKATHON,
        consentToCall: true,
        callStatus: "completed",
        profileStatus: "ready",
        eventId: demoEvent.id,
      },
    });

    await prisma.call.create({
      data: {
        participantId: participant.id,
        providerCallId: `seed-call-${participant.id}`,
        status: "completed",
        transcriptText: transcript,
        consentGiven: true,
        durationSeconds: 220,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    await prisma.participantProfile.create({
      data: {
        participantId: participant.id,
        skills: r.skills,
        primaryRole: r.skills[0],
        strongestSkill: r.skills[0],
        experienceLevel: r.level,
        projectIdea: r.idea || "Open to team ideas",
        ideaSummary: r.idea || "Looking for a compelling problem to tackle.",
        domainInterests: r.domain,
        wantsToLead: r.lead,
        openToJoinOtherTeam: !r.lead,
        preferredTeamSize: 4,
        neededTeammates: r.lead ? ["frontend", "design"] : ["backend", "pitch"],
        availability: "full_hackathon",
        existingTeamStatus: "solo",
        confidenceScore: 0.88,
        missingFields: [],
        extractionNotes: "seed profile",
        rawExtraction: {},
      },
    });
  }

  const pending = await prisma.participant.create({
    data: {
      externalRegistrationId: "seed-pending",
      fullName: "Casey Doe",
      email: "casey@example.com",
      phone: "+491111111099",
      city: "Berlin",
      hackathonName: HACKATHON,
      consentToCall: true,
      callStatus: "no_answer",
      profileStatus: "pending",
      eventId: demoEvent.id,
    },
  });

  console.log(
    `Seed complete: ${roster.length} ready participants + pending ${pending.id}. Demo event slug: ${demoEvent.slug}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
