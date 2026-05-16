import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      title: true,
      description: true,
      locationSummary: true,
      startsAt: true,
      endsAt: true,
      registrationOpen: true,
      slug: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ event });
}
