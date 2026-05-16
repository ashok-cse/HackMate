import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hackmateServerLog } from "@/lib/server-log";
import { setHackathonCampaignPaused } from "@/lib/hackathon-campaign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    hackmateServerLog("hackmate:campaigns:pause", "Missing hackathonName", {}, "warn");
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  hackmateServerLog("hackmate:campaigns:pause", "Pausing", { hackathonName });

  await setHackathonCampaignPaused(prisma, hackathonName, true);

  hackmateServerLog("hackmate:campaigns:pause", "Ok", { hackathonName });

  return NextResponse.json({ ok: true, paused: true, hackathonName });
}
