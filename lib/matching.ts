import type { Participant, ParticipantProfile, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MAX_TEAM = 5;

export type EnrichedParticipant = Participant & {
  profile: ParticipantProfile | null;
};

function normSkill(raw: string): string {
  const s = raw.toLowerCase();
  if (/react|vue|angular|html|css|svelte/.test(s)) return "frontend";
  if (/node|django|spring|laravel|backend|api/.test(s)) return "backend";
  if (/python|ml|llm|rag|tensorflow|pytorch|ai/.test(s)) return "ai_ml";
  if (/figma|ui|ux|design/.test(s)) return "design";
  if (/pitch|business|story|gtm/.test(s)) return "pitch_business";
  if (/docker|aws|gcp|kubernetes|ci/.test(s)) return "devops";
  if (/flutter|android|ios|mobile/.test(s)) return "mobile";
  return raw.trim() || "generalist";
}

export function normalizedSkills(p: EnrichedParticipant): Set<string> {
  const out = new Set<string>();
  const prof = p.profile;
  const rawList: string[] = [];
  if (Array.isArray(prof?.skills)) {
    rawList.push(...(prof!.skills as unknown[]).map(String));
  }
  if (p.knownSkills) rawList.push(...p.knownSkills.split(/[,;]/));
  if (prof?.strongestSkill) rawList.push(prof.strongestSkill);
  for (const r of rawList) out.add(normSkill(r));
  if (out.size === 0) out.add("generalist");
  return out;
}

function domainKey(p: EnrichedParticipant): string {
  const domains = (p.profile?.domainInterests as string[] | undefined) ?? [];
  return domains[0] ?? "general";
}

function scorePair(a: EnrichedParticipant, b: EnrichedParticipant): number {
  let score = 0;
  const da = domainKey(a);
  const db = domainKey(b);
  if (da === db) score += 25;

  const sa = normalizedSkills(a);
  const sb = normalizedSkills(b);
  let overlap = 0;
  for (const x of sa) if (sb.has(x)) overlap++;
  const union = new Set([...sa, ...sb]);
  const diversity = 1 - overlap / Math.max(union.size, 1);
  score += diversity * 25;

  const ideaA = (a.profile?.projectIdea ?? "").length > 12;
  const ideaB = (b.profile?.projectIdea ?? "").length > 12;
  if (ideaA && ideaB) score += 20;

  const leadA = Boolean(a.profile?.wantsToLead);
  const leadB = Boolean(b.profile?.wantsToLead);
  if (leadA !== leadB) score += 10;
  else score += 5;

  const ea = a.profile?.experienceLevel ?? "unknown";
  const eb = b.profile?.experienceLevel ?? "unknown";
  if (ea !== "unknown" && eb !== "unknown" && ea !== eb) score += 10;
  else score += 4;

  const avail =
    (a.profile?.availability ?? "").toLowerCase() ===
      (b.profile?.availability ?? "").toLowerCase() && (a.profile?.availability ?? "") !== ""
      ? 10
      : 5;
  score += avail;

  return Math.min(100, score);
}

function teamScore(members: EnrichedParticipant[]): number {
  if (members.length < 2) return 70;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      total += scorePair(members[i], members[j]);
      pairs++;
    }
  }
  return Math.round(pairs ? total / pairs : 70);
}

function skillBalanceSummary(members: EnrichedParticipant[]): string {
  const bag = new Map<string, number>();
  for (const m of members) {
    for (const s of normalizedSkills(m)) bag.set(s, (bag.get(s) ?? 0) + 1);
  }
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

function projectSummaryForTeam(members: EnrichedParticipant[]): string {
  const withIdea = members.find((m) => (m.profile?.ideaSummary ?? "").length > 8);
  return (
    withIdea?.profile?.ideaSummary ??
    withIdea?.profile?.projectIdea ??
    "Mixed hackathon ideas — organizers should confirm theme."
  );
}

function risksForTeam(members: EnrichedParticipant[]): string[] {
  const risks: string[] = [];
  const skills = members.flatMap((m) => [...normalizedSkills(m)]);
  const hasFrontend = skills.some((s) => s === "frontend" || s === "mobile");
  const hasBackend = skills.some((s) => s === "backend" || s === "ai_ml");
  if (!hasFrontend) risks.push("No clear frontend/mobile skill.");
  if (!hasBackend) risks.push("No clear backend/AI builder.");
  const leads = members.filter((m) => m.profile?.wantsToLead).length;
  if (leads === 0) risks.push("No explicit lead preference.");
  if (leads > 2) risks.push("Multiple lead personalities — clarify roles.");
  return risks;
}

/** Removes unlocked suggested teams for a hackathon before regenerating. */
async function clearSuggestedTeams(tx: Prisma.TransactionClient, hackathonName: string) {
  const teams = await tx.team.findMany({
    where: { hackathonName, status: "suggested", locked: false },
    select: { id: true },
  });
  for (const t of teams) {
    await tx.teamMember.deleteMany({ where: { teamId: t.id } });
    await tx.team.delete({ where: { id: t.id } });
  }
}

export async function generateSuggestedTeams(hackathonName: string): Promise<{ teams: number }> {
  const eligible = await prisma.participant.findMany({
    where: {
      hackathonName,
      callStatus: "completed",
      consentToCall: true,
      profileStatus: { not: "needs_manual_review" },
    },
    include: { profile: true },
  });

  const filtered = eligible.filter((p) => {
    const conf = p.profile?.confidenceScore;
    if (typeof conf === "number" && conf > 0 && conf < 0.45) return false;
    return true;
  });

  const assigned = new Set<string>();
  const planned: EnrichedParticipant[][] = [];

  const byExistingName = new Map<string, EnrichedParticipant[]>();
  for (const p of filtered) {
    const g = p.existingTeamName?.trim();
    if (!g) continue;
    const arr = byExistingName.get(g) ?? [];
    arr.push(p);
    byExistingName.set(g, arr);
  }

  for (const [, group] of byExistingName) {
    const slice = group.slice(0, MAX_TEAM);
    for (const m of slice) assigned.add(m.id);
    if (slice.length) planned.push(slice);
  }

  const soloPool = filtered.filter((p) => !assigned.has(p.id));

  const anchors = soloPool
    .filter(
      (p) =>
        p.profile?.wantsToLead &&
        (p.profile?.projectIdea?.length ?? 0) > 8 &&
        p.profile?.existingTeamStatus !== "full_team",
    )
    .sort((a, b) => (b.profile?.confidenceScore ?? 0) - (a.profile?.confidenceScore ?? 0));

  const restPool = soloPool.filter((p) => !anchors.includes(p));

  for (const anchor of anchors) {
    if (assigned.has(anchor.id)) continue;
    const team: EnrichedParticipant[] = [anchor];
    assigned.add(anchor.id);

    while (team.length < MAX_TEAM && restPool.length) {
      let best: EnrichedParticipant | null = null;
      let bestScore = -1;
      for (const cand of restPool) {
        if (assigned.has(cand.id)) continue;
        const tentative = [...team, cand];
        const sc = teamScore(tentative);
        if (sc > bestScore) {
          bestScore = sc;
          best = cand;
        }
      }
      if (!best) break;
      team.push(best);
      assigned.add(best.id);
    }
    planned.push(team);
  }

  const leftover = soloPool.filter((p) => !assigned.has(p.id));
  leftover.sort((a, b) => domainKey(a).localeCompare(domainKey(b)));

  while (leftover.length) {
    const seed = leftover.shift()!;
    const team: EnrichedParticipant[] = [seed];
    assigned.add(seed.id);
    while (team.length < MAX_TEAM && leftover.length) {
      let bestIdx = -1;
      let bestScore = -1;
      for (let i = 0; i < leftover.length; i++) {
        const cand = leftover[i];
        const sc = teamScore([...team, cand]);
        if (sc > bestScore) {
          bestScore = sc;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const [picked] = leftover.splice(bestIdx, 1);
      team.push(picked);
      assigned.add(picked.id);
    }
    planned.push(team);
  }

  await prisma.$transaction(async (tx) => {
    await clearSuggestedTeams(tx, hackathonName);

    let idx = 1;
    for (const members of planned) {
      if (!members.length) continue;
      const title =
        members.find((m) => (m.profile?.projectIdea ?? "").length > 10)?.profile?.ideaSummary ??
        `Team ${idx}`;
      const matchScore = teamScore(members);
      const risks = risksForTeam(members);
      const reason = `Balanced skills (${skillBalanceSummary(
        members,
      )}), domain alignment, and role mix. Score ${matchScore}.`;

      const team = await tx.team.create({
        data: {
          hackathonName,
          teamName: `Team ${idx}`,
          projectTitle: title.slice(0, 120),
          projectSummary: projectSummaryForTeam(members),
          domain: domainKey(members[0]),
          matchScore,
          status: "suggested",
          reason,
          risks,
        },
      });

      for (const m of members) {
        const role = m.profile?.primaryRole ?? [...normalizedSkills(m)][0] ?? "participant";
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            participantId: m.id,
            suggestedRole: role,
            isLead: Boolean(m.profile?.wantsToLead),
            source: "algorithm",
          },
        });
      }

      idx++;
    }
  });

  const count = await prisma.team.count({ where: { hackathonName, status: "suggested" } });
  return { teams: count };
}
