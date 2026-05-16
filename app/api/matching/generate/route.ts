import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateSuggestedTeams } from "@/lib/matching";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as { hackathonName?: string };
  const hackathonName = body.hackathonName?.trim();
  if (!hackathonName) {
    return NextResponse.json({ error: "hackathonName required" }, { status: 400 });
  }

  const result = await generateSuggestedTeams(hackathonName);
  return NextResponse.json(result);
}
