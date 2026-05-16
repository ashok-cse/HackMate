import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { kind } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const hackathon = searchParams.get("hackathon") ?? undefined;
  const whereHack = hackathon ? { hackathonName: hackathon } : {};

  let filename = "export.csv";
  let csv = "";

  if (kind === "final-teams") {
    filename = "final-teams.csv";
    const teams = await prisma.team.findMany({
      where: { ...whereHack, status: "final" },
      include: { members: { include: { participant: true } } },
    });
    const rows = [["team_name", "participant_name", "email", "phone", "role"]];
    for (const t of teams) {
      for (const m of t.members) {
        rows.push([
          t.teamName,
          m.participant.fullName,
          m.participant.email,
          m.participant.phone,
          m.suggestedRole ?? "",
        ]);
      }
    }
    csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  } else if (kind === "participants") {
    filename = "participants.csv";
    const list = await prisma.participant.findMany({
      where: whereHack,
      include: { profile: true },
    });
    const rows = [
      [
        "full_name",
        "email",
        "phone",
        "call_status",
        "profile_status",
        "skills",
        "idea_summary",
        "final_team_id",
      ],
    ];
    for (const p of list) {
      const skills = Array.isArray(p.profile?.skills)
        ? (p.profile!.skills as string[]).join(";")
        : "";
      rows.push([
        p.fullName,
        p.email,
        p.phone,
        p.callStatus,
        p.profileStatus,
        skills,
        p.profile?.ideaSummary ?? "",
        p.finalTeamId ?? "",
      ]);
    }
    csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  } else if (kind === "unmatched") {
    filename = "unmatched.csv";
    const list = await prisma.participant.findMany({
      where: {
        ...whereHack,
        OR: [
          { teamMemberships: { none: {} } },
          { profileStatus: "needs_manual_review" },
          { callStatus: "no_answer" },
        ],
      },
      include: { profile: true },
    });
    const rows = [["full_name", "email", "call_status", "profile_status", "notes"]];
    for (const p of list) {
      rows.push([p.fullName, p.email, p.callStatus, p.profileStatus, p.organizerNotes ?? ""]);
    }
    csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  } else if (kind === "calls") {
    filename = "calls.csv";
    const participantFilter =
      hackathon !== undefined && hackathon !== ""
        ? { participant: { hackathonName: hackathon } }
        : {};
    const calls = await prisma.call.findMany({
      where: participantFilter,
      include: { participant: true },
      orderBy: { createdAt: "desc" },
    });
    const rows = [
      [
        "participant_name",
        "email",
        "status",
        "duration_seconds",
        "consent_given",
        "started_at",
      ],
    ];
    for (const c of calls) {
      rows.push([
        c.participant.fullName,
        c.participant.email,
        c.status ?? "",
        c.durationSeconds != null ? String(c.durationSeconds) : "",
        c.consentGiven === null ? "" : c.consentGiven ? "true" : "false",
        c.startedAt?.toISOString() ?? "",
      ]);
    }
    csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  } else {
    return NextResponse.json({ error: "Unknown export type" }, { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
