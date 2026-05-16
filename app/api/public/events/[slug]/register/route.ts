import { NextResponse } from "next/server";
import { validEmail, validPhone } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!event.registrationOpen) {
    return NextResponse.json({ error: "Registration is closed" }, { status: 403 });
  }

  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    phone?: string;
    city?: string;
    universityOrCompany?: string;
    registrationType?: string;
    knownSkills?: string;
    existingTeamName?: string;
    notes?: string;
    consentToCall?: boolean;
  };

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const phone = body.phone?.trim() ?? "";
  if (!fullName || !email || !phone) {
    return NextResponse.json({ error: "Name, email, and phone are required" }, { status: 400 });
  }
  if (!validEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!validPhone(phone)) {
    return NextResponse.json(
      { error: "Phone must be E.164 (+country…) or 8–15 digits" },
      { status: 400 },
    );
  }
  if (!body.consentToCall) {
    return NextResponse.json(
      { error: "You must consent to be contacted for team matching" },
      { status: 400 },
    );
  }

  const row = await prisma.eventRegistration.upsert({
    where: {
      eventId_email: { eventId: event.id, email },
    },
    create: {
      eventId: event.id,
      fullName,
      email,
      phone,
      city: body.city?.trim() || null,
      universityOrCompany: body.universityOrCompany?.trim() || null,
      registrationType: body.registrationType?.trim() || null,
      knownSkills: body.knownSkills?.trim() || null,
      existingTeamName: body.existingTeamName?.trim() || null,
      notes: body.notes?.trim() || null,
      consentToCall: true,
    },
    update: {
      fullName,
      phone,
      city: body.city?.trim() || null,
      universityOrCompany: body.universityOrCompany?.trim() || null,
      registrationType: body.registrationType?.trim() || null,
      knownSkills: body.knownSkills?.trim() || null,
      existingTeamName: body.existingTeamName?.trim() || null,
      notes: body.notes?.trim() || null,
      consentToCall: true,
    },
  });

  return NextResponse.json({
    ok: true,
    registrationId: row.id,
    message: "You’re signed up. Organizers will follow up with voice matching details.",
  });
}
