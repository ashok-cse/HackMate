export type ExtractedProfile = {
  participant_name: string;
  skills: string[];
  primary_role: string;
  strongest_skill: string;
  experience_level: "beginner" | "intermediate" | "advanced" | "unknown";
  project_idea: string;
  idea_summary: string;
  domain_interests: string[];
  wants_to_lead: boolean;
  open_to_join_other_team: boolean;
  preferred_team_size: number;
  needed_teammates: string[];
  availability: string;
  existing_team_status: "solo" | "partial_team" | "full_team" | "unknown";
  confidence_score: number;
  missing_fields: string[];
  extraction_notes: string;
};

const LEVEL_RE = /\b(beginner|intermediate|advanced)\b/gi;

/** Pioneer native GLiNER: `POST https://api.pioneer.ai/inference` (see api-reference/inference/pioneer). */
function isPioneerNativeInferenceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "api.pioneer.ai" && u.pathname.replace(/\/$/, "") === "/inference";
  } catch {
    return false;
  }
}

/** Pioneer decoder via OpenAI-compatible chat. */
function isPioneerChatCompletionsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "api.pioneer.ai" && u.pathname.replace(/\/$/, "") === "/v1/chat/completions"
    );
  } catch {
    return false;
  }
}

/** Default NER labels: base GLiNER supports standard types; fine-tune to add domain-specific spans. */
const GLINER_ENTITY_LABELS = [
  "person",
  "organization",
  "location",
  "product",
  "event",
  "skill",
  "technology",
  "project",
] as const;

type GlinerSpan = { text: string; label: string };

function collectGlinerSpans(body: unknown): GlinerSpan[] {
  const found: GlinerSpan[] = [];
  const seen = new Set<string>();

  function walk(o: unknown): void {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      if (
        o.length > 0 &&
        typeof o[0] === "object" &&
        o[0] !== null &&
        "text" in (o[0] as object) &&
        ("label" in (o[0] as object) || "type" in (o[0] as object))
      ) {
        for (const item of o) {
          if (!item || typeof item !== "object") continue;
          const it = item as Record<string, unknown>;
          const text =
            typeof it.text === "string"
              ? it.text
              : typeof it.span === "string"
                ? it.span
                : null;
          const label =
            typeof it.label === "string"
              ? it.label
              : typeof it.type === "string"
                ? it.type
                : typeof it.entity === "string"
                  ? it.entity
                  : null;
          if (text && label) {
            const k = `${label}:${text}`;
            if (!seen.has(k)) {
              seen.add(k);
              found.push({ text, label });
            }
          }
        }
        return;
      }
      for (const item of o) walk(item);
      return;
    }
    const obj = o as Record<string, unknown>;
    for (const v of Object.values(obj)) walk(v);
  }

  walk(body);
  return found;
}

function mapEntityTextsToSkills(texts: string[]): string[] {
  const tags = new Set<string>();
  const rules: [string, RegExp][] = [
    ["frontend", /react|vue|angular|css|html|frontend|typescript|javascript/i],
    ["backend", /node|django|spring|backend|api|laravel|fastapi|go\b|rust/i],
    ["ai_ml", /python|ml|llm|rag|model|tensorflow|pytorch|openai/i],
    ["design", /figma|ui\b|ux\b|design/i],
    ["pitch_business", /pitch|business|story|gtm|marketing/i],
    ["devops", /docker|aws|gcp|kubernetes|ci\/cd|terraform/i],
    ["mobile", /flutter|android|ios|react native|mobile|swift/i],
  ];
  for (const raw of texts) {
    const t = raw.trim();
    if (!t) continue;
    let hit = false;
    for (const [tag, re] of rules) {
      if (re.test(t)) {
        tags.add(tag);
        hit = true;
      }
    }
    if (!hit) tags.add(t.length > 48 ? `${t.slice(0, 45)}...` : t.toLowerCase().replace(/\s+/g, "_"));
  }
  return tags.size ? [...tags] : ["generalist"];
}

function glinerSpansToPartial(
  spans: GlinerSpan[],
  transcript: string,
  fallbackName: string,
): Partial<ExtractedProfile> {
  if (spans.length === 0) return {};

  const by = new Map<string, string[]>();
  for (const e of spans) {
    const l = e.label.toLowerCase();
    if (!by.has(l)) by.set(l, []);
    by.get(l)!.push(e.text);
  }

  const person =
    by.get("person")?.join(" ").trim() ||
    by.get("per")?.[0] ||
    by.get("name")?.[0];

  const skillish = [
    ...(by.get("skill") ?? []),
    ...(by.get("technology") ?? []),
    ...(by.get("product") ?? []),
  ];
  const skills = skillish.length ? mapEntityTextsToSkills(skillish) : undefined;

  const projectBits = [...(by.get("project") ?? []), ...(by.get("event") ?? [])];
  const project_idea = projectBits.length ? projectBits.join("; ") : undefined;

  const domainHints = [...(by.get("organization") ?? []), ...(by.get("location") ?? [])];
  const domain_interests =
    domainHints.length > 0
      ? domainHints.map((s) =>
          s.length > 64 ? s.slice(0, 61).concat("...") : s.toLowerCase().replace(/\s+/g, "_"),
        )
      : undefined;

  return {
    participant_name: person || undefined,
    skills,
    primary_role: skills?.[0],
    strongest_skill: skills?.[0],
    project_idea,
    idea_summary: project_idea ?? (transcript.length > 280 ? `${transcript.slice(0, 277)}...` : transcript),
    domain_interests,
    confidence_score: Math.min(0.95, 0.42 + Math.min(spans.length, 12) * 0.04),
    extraction_notes: `Pioneer GLiNER (${spans.length} span${spans.length === 1 ? "" : "s"})`,
  };
}

async function extractViaGlinerNative(
  transcript: string,
  fallbackName: string,
  url: string,
  apiKey: string,
  modelId: string,
): Promise<Partial<ExtractedProfile> | null> {
  const thresholdRaw = process.env.PIONEER_INFERENCE_THRESHOLD;
  const threshold =
    thresholdRaw !== undefined && thresholdRaw !== ""
      ? Math.min(1, Math.max(0, Number(thresholdRaw)))
      : 0.4;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      model_id: modelId,
      text: transcript,
      schema: {
        entities: [...GLINER_ENTITY_LABELS],
      },
      threshold: Number.isFinite(threshold) ? threshold : 0.4,
    }),
  });

  if (!res.ok) return null;
  const body: unknown = await res.json();
  const spans = collectGlinerSpans(body);
  if (spans.length === 0) return {};
  return glinerSpansToPartial(spans, transcript, fallbackName);
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const inner = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(inner) as unknown;
}

function trimEnv(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t === "" ? undefined : t;
}

async function extractViaPioneerOpenAi(
  transcript: string,
  fallbackName: string,
  url: string,
  apiKey: string,
  modelId: string,
): Promise<Partial<ExtractedProfile> | null> {
  const system = `You extract hackathon participant profiles from call transcripts. Reply with one JSON object only (no markdown), keys:
participant_name, skills (string[]), primary_role, strongest_skill, experience_level (beginner|intermediate|advanced|unknown),
project_idea, idea_summary, domain_interests (string[]), wants_to_lead, open_to_join_other_team, preferred_team_size (2-5),
needed_teammates (string[]), availability, existing_team_status (solo|partial_team|full_team|unknown),
confidence_score (0-1), missing_fields (string[]), extraction_notes.
If the name is unclear, set participant_name to ${JSON.stringify(fallbackName)}.`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: transcript },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") return null;
  const data = parseJsonLoose(text) as Partial<ExtractedProfile>;
  return data;
}

export async function extractProfileFromTranscript(
  transcript: string,
  fallbackName: string,
): Promise<ExtractedProfile> {
  const url = trimEnv(process.env.PIONEER_INFERENCE_URL);
  const key = trimEnv(process.env.PIONEER_API_KEY);
  if (url && key) {
    const modelId = trimEnv(process.env.PIONEER_MODEL_ID);
    if (modelId && isPioneerNativeInferenceUrl(url)) {
      try {
        const partial = await extractViaGlinerNative(transcript, fallbackName, url, key, modelId);
        if (partial && Object.keys(partial).length > 0) {
          return normalizeExtracted(partial, fallbackName, transcript);
        }
      } catch {
        // fall through
      }
      const decoderModelId = trimEnv(process.env.PIONEER_DECODER_MODEL_ID);
      if (decoderModelId) {
        const chatUrl = "https://api.pioneer.ai/v1/chat/completions";
        try {
          const data = await extractViaPioneerOpenAi(
            transcript,
            fallbackName,
            chatUrl,
            key,
            decoderModelId,
          );
          if (data) return normalizeExtracted(data, fallbackName, transcript);
        } catch {
          // fall through
        }
      }
    }
    if (modelId && isPioneerChatCompletionsUrl(url)) {
      try {
        const data = await extractViaPioneerOpenAi(transcript, fallbackName, url, key, modelId);
        if (data) return normalizeExtracted(data, fallbackName, transcript);
      } catch {
        // fall through
      }
    }
    const customProxy =
      !isPioneerNativeInferenceUrl(url) && !isPioneerChatCompletionsUrl(url);
    if (customProxy) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ transcript }),
        });
        if (res.ok) {
          const data = (await res.json()) as Partial<ExtractedProfile>;
          return normalizeExtracted(data, fallbackName, transcript);
        }
      } catch {
        // fall through to local extractor
      }
    }
  }
  return heuristicExtract(transcript, fallbackName);
}

function normalizeExtracted(
  raw: Partial<ExtractedProfile>,
  fallbackName: string,
  transcript: string,
): ExtractedProfile {
  const base = heuristicExtract(transcript, fallbackName);
  return {
    participant_name: raw.participant_name ?? base.participant_name,
    skills: Array.isArray(raw.skills) ? raw.skills : base.skills,
    primary_role: raw.primary_role ?? base.primary_role,
    strongest_skill: raw.strongest_skill ?? base.strongest_skill,
    experience_level: raw.experience_level ?? base.experience_level,
    project_idea: raw.project_idea ?? base.project_idea,
    idea_summary: raw.idea_summary ?? base.idea_summary,
    domain_interests: Array.isArray(raw.domain_interests)
      ? raw.domain_interests
      : base.domain_interests,
    wants_to_lead:
      typeof raw.wants_to_lead === "boolean" ? raw.wants_to_lead : base.wants_to_lead,
    open_to_join_other_team:
      typeof raw.open_to_join_other_team === "boolean"
        ? raw.open_to_join_other_team
        : base.open_to_join_other_team,
    preferred_team_size:
      typeof raw.preferred_team_size === "number"
        ? Math.min(5, Math.max(2, raw.preferred_team_size))
        : base.preferred_team_size,
    needed_teammates: Array.isArray(raw.needed_teammates)
      ? raw.needed_teammates
      : base.needed_teammates,
    availability: raw.availability ?? base.availability,
    existing_team_status: raw.existing_team_status ?? base.existing_team_status,
    confidence_score:
      typeof raw.confidence_score === "number" ? raw.confidence_score : base.confidence_score,
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields : base.missing_fields,
    extraction_notes: raw.extraction_notes ?? base.extraction_notes,
  };
}

function heuristicExtract(transcript: string, fallbackName: string): ExtractedProfile {
  const t = transcript.toLowerCase();
  const skills: string[] = [];
  const tags: [string, string[]][] = [
    ["frontend", ["react", "vue", "angular", "css", "html", "frontend"]],
    ["backend", ["node", "django", "spring", "backend", "api", "laravel"]],
    ["ai_ml", ["python", "ml", "llm", "rag", "model", "tensorflow"]],
    ["design", ["figma", "ui", "ux", "design"]],
    ["pitch_business", ["pitch", "business", "story", "gtm"]],
    ["devops", ["docker", "aws", "gcp", "kubernetes", "ci/cd"]],
    ["mobile", ["flutter", "android", "ios", "react native", "mobile"]],
  ];
  for (const [label, keys] of tags) {
    if (keys.some((k) => t.includes(k))) skills.push(label);
  }
  if (skills.length === 0) skills.push("generalist");

  let experience_level: ExtractedProfile["experience_level"] = "unknown";
  const m = transcript.match(LEVEL_RE);
  if (m?.length) {
    const v = m[m.length - 1].toLowerCase();
    if (v === "beginner" || v === "intermediate" || v === "advanced") experience_level = v;
  }

  const hasIdea = /\bidea\b|\bbuild\b|\bhack\b|\bproject\b/.test(t);
  const wantsLead = /\blead\b|\bleading\b|\bfounder\b/.test(t);
  const openJoin = /\bjoin\b|\bteam\b/.test(t);

  const domains = ["ai", "fintech", "health", "climate", "education", "devtools", "social"];
  const domain_interests = domains.filter((d) => t.includes(d));

  const preferred_team_size = t.includes("five") || t.includes("5") ? 5 : 4;

  let existing_team_status: ExtractedProfile["existing_team_status"] = "unknown";
  if (/\balone\b|\bsolo\b|\bmyself\b/.test(t)) existing_team_status = "solo";
  if (/\bpartial\b|\bfew of us\b|\bsmall team\b/.test(t)) existing_team_status = "partial_team";
  if (/\bfull team\b|\balready complete\b/.test(t)) existing_team_status = "full_team";

  const idea_summary = transcript.length > 280 ? `${transcript.slice(0, 277)}...` : transcript;

  const missing: string[] = [];
  if (!hasIdea) missing.push("project_idea");
  if (experience_level === "unknown") missing.push("experience_level");

  const confidence = Math.min(
    0.95,
    0.55 + skills.length * 0.08 + (hasIdea ? 0.15 : 0) + (experience_level !== "unknown" ? 0.1 : 0),
  );

  return {
    participant_name: fallbackName,
    skills,
    primary_role: skills[0] ?? "participant",
    strongest_skill: skills[0] ?? "unknown",
    experience_level,
    project_idea: hasIdea ? idea_summary : "",
    idea_summary,
    domain_interests: domain_interests.length ? domain_interests : ["general"],
    wants_to_lead: wantsLead,
    open_to_join_other_team: openJoin || !wantsLead,
    preferred_team_size,
    needed_teammates: skills.includes("frontend") ? ["backend", "design"] : ["frontend", "pitch"],
    availability: t.includes("full") ? "full_hackathon" : "unknown",
    existing_team_status,
    confidence_score: confidence,
    missing_fields: missing,
    extraction_notes:
      "Local heuristic — set PIONEER_API_KEY and URL; for call transcripts prefer https://api.pioneer.ai/v1/chat/completions + decoder model, or PIONEER_DECODER_MODEL_ID with /inference.",
  };
}
