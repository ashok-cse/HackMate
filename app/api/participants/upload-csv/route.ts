import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseParticipantsCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Expected file field" }, { status: 400 });
  }

  const text = await file.text();
  const { rows, errors } = parseParticipantsCsv(text);
  const blocking = errors.filter(
    (e) =>
      e.startsWith("Missing required column") ||
      e.includes("No data rows") ||
      e.includes("CSV parse"),
  );
  if (blocking.length) {
    return NextResponse.json({ errors: blocking }, { status: 400 });
  }

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const email = String(row.email ?? "").trim().toLowerCase();
    const consentToCall = parseBool(String(row.consent_to_call ?? "false"));
    const data = {
      externalRegistrationId: String(row.participant_id ?? "").trim() || null,
      fullName: String(row.full_name ?? "").trim(),
      email,
      phone: String(row.phone ?? "").trim(),
      city: String(row.city ?? "").trim() || null,
      hackathonName: String(row.hackathon_name ?? "").trim(),
      universityOrCompany: String(row.university_or_company ?? "").trim() || null,
      registrationType: String(row.registration_type ?? "").trim() || null,
      knownSkills: String(row.known_skills ?? "").trim() || null,
      existingTeamName: String(row.existing_team_name ?? "").trim() || null,
      notes: String(row.notes ?? "").trim() || null,
      consentToCall,
    };

    const existing = await prisma.participant.findUnique({ where: { email } });
    if (existing) {
      await prisma.participant.update({
        where: { email },
        data: {
          ...data,
          email,
        },
      });
      updated++;
    } else {
      await prisma.participant.create({ data });
      created++;
    }
  }

  await prisma.appSettings.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });

  return NextResponse.json({
    created,
    updated,
    warnings: errors,
    total: rows.length,
  });
}
