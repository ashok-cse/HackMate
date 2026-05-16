import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          city: true,
          consentToCall: true,
          promotedParticipantId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const body = (await req.json()) as {
    title?: string;
    description?: string | null;
    locationSummary?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    registrationOpen?: boolean;
    slug?: string;
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.locationSummary !== undefined)
    data.locationSummary = body.locationSummary?.trim() || null;
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.registrationOpen !== undefined) data.registrationOpen = body.registrationOpen;
  if (body.slug !== undefined) {
    const s = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (s) data.slug = s;
  }

  try {
    const event = await prisma.event.update({
      where: { id },
      data,
    });
    return NextResponse.json({ event });
  } catch {
    return NextResponse.json({ error: "Update failed (duplicate slug?)" }, { status: 400 });
  }
}
