import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { registrations: true } },
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      registrationOpen: e.registrationOpen,
      startsAt: e.startsAt,
      registrationCount: e._count.registrations,
      createdAt: e.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    locationSummary?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    registrationOpen?: boolean;
    slug?: string;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  let slug = body.slug?.trim() ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
  if (!slug) slug = uniqueSlug(title);

  const exists = await prisma.event.findUnique({ where: { slug } });
  if (exists) slug = uniqueSlug(title);

  const event = await prisma.event.create({
    data: {
      slug,
      title,
      description: body.description?.trim() || null,
      locationSummary: body.locationSummary?.trim() || null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      registrationOpen: body.registrationOpen ?? true,
    },
  });

  return NextResponse.json({ event });
}
