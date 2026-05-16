# HackMate

Hackathon **voice-call** pipeline: **Retell AI** places outbound calls → **`call_ended` webhook** delivers transcripts → **Pioneer (GLiNER or LLM)** plus heuristics extract a profile → **rule/score matching** and **team formation** → **organizer dashboard** (participants, teams, export).

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
- **Campaigns** — start/pause outbound calling by hackathon; uses **Retell AI** when `RETELL_*` is configured.
- **Webhooks** — `POST /api/webhooks/retell` ingests **Retell** `call_ended` events and runs extraction + matching hooks.
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
| `RETELL_API_KEY`, `RETELL_FROM_NUMBER` | Outbound calls via [Retell AI](https://www.retellai.com/); without both, participants stay queued locally until you configure them. |
| `RETELL_AGENT_ID` | Optional override if the caller ID is not already bound to an agent. |
| `RETELL_LLM_CONTEXT` | Optional. Sent on every outbound dial as dynamic variable **`hackmate_brief`** — reference `{{hackmate_brief}}` in your Retell agent prompt for hackathon-specific instructions. |
| `RETELL_WEBHOOK_VERIFICATION_KEY` | Optional. Use the **webhook-enabled** API key from the Retell dashboard for verifying `X-Retell-Signature`. If unset, **`RETELL_API_KEY`** is used (must still be webhook-enabled for real events to verify). See [Retell secure webhook](https://docs.retellai.com/features/secure-webhook). |
| `RETELL_WEBHOOK_REJECT_UNSIGNED` | Default: unsigned “Test” requests from the Retell UI are allowed (`false`). Set `true` to require a signature on every POST (Tests may return 401). |
| `PIONEER_INFERENCE_URL`, `PIONEER_API_KEY`, `PIONEER_MODEL_ID` | Optional transcript extraction. Default URL targets **GLiNER**: `https://api.pioneer.ai/inference` with `X-API-Key` and a model such as `fastino/gliner2-base-v1` ([docs](https://docs.pioneer.ai/api-reference/inference/pioneer)). For **LLM JSON** extraction, use `https://api.pioneer.ai/v1/chat/completions` and a decoder model id. Optional `PIONEER_INFERENCE_THRESHOLD` (0–1). A **custom** HTTPS URL can act as a proxy: `Authorization: Bearer …`, body `{ "transcript" }`, JSON profile response. |

`NEXT_PUBLIC_*` values are embedded at **build time**; change them in Docker/EasyPanel and **rebuild** when deploying.

### Retell AI webhooks & agent prompt

Register **`POST https://YOUR_DOMAIN/api/webhooks/retell`** for **`call_ended`**. HackMate reads **`participant_id`** from call metadata or `retell_llm_dynamic_variables` (set automatically on outbound).

- **401 on “Test”:** The Retell dashboard **Test** button often POSTs **without** `X-Retell-Signature`. With verification keys set, HackMate now answers that with **200** JSON by default. **Live** webhooks include the signature ([docs](https://docs.retellai.com/features/secure-webhook)). Use an API key that shows the **webhook** badge in Retell; put it in **`RETELL_WEBHOOK_VERIFICATION_KEY`** (or **`RETELL_API_KEY`**).
- **Customize the agent:** In the Retell dashboard, edit the agent’s prompt and use dynamic variables HackMate sends: **`{{participant_id}}`**, **`{{full_name}}`**, **`{{hackathon_name}}`**, **`{{known_skills}}`**, etc., plus **`{{hackmate_brief}}`** when **`RETELL_LLM_CONTEXT`** is set in env (hackathon rules / tone).

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
| `POST` | `/api/webhooks/retell` | Retell AI `call_ended` (transcript, metadata with `participant_id`, …). |
| `POST` | `/api/matching/generate` | `{ hackathonName }` |
| `POST` | `/api/teams/finalize` | `{ hackathonName }` |
| `GET` | `/api/export/[kind]` | Query `hackathon`; kinds include `final-teams`, `participants`, `unmatched`, `calls`. |
| `GET` | `/api/stats` | Aggregate stats. |

## Repository layout (high level)

- `app/` — routes (dashboard, login, public `/e/[slug]`, API route handlers).
- `lib/` — domain logic (e.g. extraction, matching helpers).
- `prisma/` — `schema.prisma`, `seed.ts`.
