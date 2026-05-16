import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(_req);
  if (denied) return denied;
  const { id } = await ctx.params;

  const team = await prisma.team.update({
    where: { id },
    data: { locked: true, status: "locked" },
  });

  return NextResponse.json({ team });
}
