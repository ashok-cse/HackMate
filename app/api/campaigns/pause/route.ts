import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setHackathonCampaignPaused } from "@/lib/hackathon-campaign";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    console.warn("[hackmate:campaigns:pause] Missing hackathonName");
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  console.info("[hackmate:campaigns:pause] Pausing", { hackathonName });

  await setHackathonCampaignPaused(prisma, hackathonName, true);

  console.info("[hackmate:campaigns:pause] Ok", { hackathonName });

  return NextResponse.json({ ok: true, paused: true, hackathonName });
}
