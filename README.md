# HackMate

Hackathon **voice-call** pipeline: **SLNG** places calls → **call-ended webhook** delivers transcripts → **Pioneer (GLiNER or LLM)** plus heuristics extract a profile → **rule/score matching** and **team formation** → **organizer dashboard** (participants, teams, export).

## Stack

| Layer | Choice |
| --- | --- |
| App | [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Data | PostgreSQL, [Prisma](https://www.prisma.io/) 6 |
| CSV | Papa Parse |

## Features

- **Dashboard** (`/dashboard`) — stats, participant list/detail, CSV upload, unmatched view, teams, export.
- **Auth** — optional `HACKMATE_ADMIN_TOKEN`; login at `/login` when set.
- **Campaigns** — start/pause outbound calling by hackathon; integrates with **SLNG Agent Infra** when configured.
- **Webhooks** — `POST /api/webhooks/slng/call-ended` ingests transcripts and runs extraction + matching hooks.
- **Extraction** — optional [Pioneer](https://docs.pioneer.ai/) native **`/inference`** (GLiNER NER) or OpenAI-compatible **chat completions** (decoder LLM); otherwise local heuristics. See **Environment**.
- **Public events** — create events under **Dashboard → Events**, share `/e/<slug>` for registration; **Promote to participants** pulls signups into the main pipeline.

## Requirements

- **Node.js** 20+
- **PostgreSQL**

## Local setup

Run commands separately (do not put shell comments on the same line as `npm`/`npx` commands).

```bash
cp .env.example .env
npm install
```

Edit `.env` (at minimum `DATABASE_URL`). See **Environment** below.

```bash
npx prisma db push
npm run db:seed   # optional; upserts global app settings only (no demo participants)
npm run dev
```

Open **`http://localhost:3000/dashboard`** (home redirects to the dashboard).

**npm scripts:** `dev`, `build`, `start`, `lint`, `db:push`, `db:seed`, `db:generate`.

**Note:** In `package.json`, keep script values as plain commands only — do not append `# …` inside a script string or `next dev` may mis-parse arguments.

## Environment

Copy from **`.env.example`** and adjust.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required). |
| `HACKMATE_ADMIN_TOKEN` | If set, protects dashboard/API; omit for open local dev. |
| `SLNG_API_KEY`, `SLNG_AGENT_ID`, `SLNG_API_BASE` | Outbound calls via SLNG; without `SLNG_API_KEY`, participants stay queued locally. |
| `SLNG_WEBHOOK_SECRET` | Must match SLNG webhook tool `auth.secret` when using HMAC. Validates inbound call-end requests when set. |
| `PIONEER_INFERENCE_URL`, `PIONEER_API_KEY`, `PIONEER_MODEL_ID` | Optional transcript extraction. Default URL targets **GLiNER**: `https://api.pioneer.ai/inference` with `X-API-Key` and a model such as `fastino/gliner2-base-v1` ([docs](https://docs.pioneer.ai/api-reference/inference/pioneer)). For **LLM JSON** extraction, use `https://api.pioneer.ai/v1/chat/completions` and a decoder model id. Optional `PIONEER_INFERENCE_THRESHOLD` (0–1). A **custom** HTTPS URL can act as a proxy: `Authorization: Bearer …`, body `{ "transcript" }`, JSON profile response. |

`NEXT_PUBLIC_*` values are embedded at **build time**; change them in Docker/EasyPanel and **rebuild** when deploying.

### SLNG call-end webhook + HMAC signing

HackMate exposes **`POST /api/webhooks/slng/call-ended`**. Align SLNG’s signing secret with **`SLNG_WEBHOOK_SECRET`** (same string in Easypanel and in the agent config).

1. Pick a secret, e.g. `openssl rand -hex 32`.
2. Set **`SLNG_WEBHOOK_SECRET`** in your deploy env (and local `.`).
3. In **SLNG** ([Agent Infra](https://docs.slng.ai/dashboard/agent-infra) or PATCH agent API), attach a **system webhook** with `call_end`, your public URL, **`auth.type: "hmac"`**, and **`auth.secret`** equal to that value ([SLNG docs](https://docs.slng.ai/examples/agents-config.md) — webhook `auth`: HMAC sends `X-Signature-256`).

`HackMate` dispatches outbound calls with a `participant_id` argument; include it in the webhook payload so ingestion can locate the participant:

```json
{
  "type": "webhook",
  "id": "REPLACE-WITH-STABLE-UUID",
  "name": "hackmate_call_end",
  "description": "Post call results to HackMate",
  "url": "https://YOUR_DOMAIN/api/webhooks/slng/call-ended",
  "parameters": { "type": "object", "properties": {}, "required": [] },
  "auth": {
    "type": "hmac",
    "secret": "SAME_SECRET_AS_SLNG_WEBHOOK_SECRET_ENV"
  },
  "source": "system",
  "wait_for_response": false,
  "system": {
    "triggers": [{ "event": "call_end" }],
    "arguments": [
      {
        "name": "participant_id",
        "type": "string",
        "required": true,
        "source": { "type": "template", "template": "{{participant_id}}" }
      },
      {
        "name": "call_id",
        "type": "string",
        "required": false,
        "source": { "type": "call_id" }
      },
      {
        "name": "transcript",
        "type": "transcript_messages",
        "required": false,
        "source": { "type": "transcript_messages", "max_messages": 200 }
      }
    ]
  }
}
```

Paste the snippet into your agent **`tools`** array (merge with existing tools). **`auth.secret`** and **`SLNG_WEBHOOK_SECRET`** must match exactly. Omit **`SLNG_WEBHOOK_SECRET`** only in trusted local dev.

## Deploy (Docker / EasyPanel)

Root **`Dockerfile`**: Next.js [standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), listens on **3000**.

1. Use PostgreSQL (managed or EasyPanel template).
2. Build from this repo with the default Dockerfile; expose **3000**.
3. Set env vars (at least `DATABASE_URL`; set `HACKMATE_ADMIN_TOKEN` in production).
4. **Schema:** this repo uses `prisma db push` (no checked-in migrations). From a dev machine with the repo installed, against production `DATABASE_URL`:

   ```bash
   npx prisma db push
   ```

   Optional: `npm run db:seed` (minimal: global app settings only; needs local deps as in local setup).

**Local image smoke test**

```bash
docker build -t hackmate .
docker run --rm -p 3000:3000 -e DATABASE_URL="postgresql://..." -e HACKMATE_ADMIN_TOKEN="..." hackmate
```

## API (selected)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Admin session when token auth is enabled. |
| `GET` / `POST` | `/api/events`, `/api/events/[id]`, … | Organizer events CRUD + promote. |
| `GET` | `/api/public/events/[slug]`, `POST` …`/register` | Public event page + signup. |
| `POST` | `/api/participants/upload-csv` | Multipart `file`. |
| `POST` | `/api/campaigns/start`, `/api/campaigns/pause` | Calling campaign control. |
| `POST` | `/api/webhooks/slng/call-ended` | SLNG call-end payload (transcript, `participant_id`, …). |
| `POST` | `/api/matching/generate` | `{ hackathonName }` |
| `POST` | `/api/teams/finalize` | `{ hackathonName }` |
| `GET` | `/api/export/[kind]` | Query `hackathon`; kinds include `final-teams`, `participants`, `unmatched`, `calls`. |
| `GET` | `/api/stats` | Aggregate stats. |

## Repository layout (high level)

- `app/` — routes (dashboard, login, public `/e/[slug]`, API route handlers).
- `lib/` — domain logic (e.g. extraction, matching helpers).
- `prisma/` — `schema.prisma`, `seed.ts`.
