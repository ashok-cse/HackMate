# HackMate

Voice-call hackathon matching MVP: **SLNG-style webhook → transcript → Pioneer-ready extraction → rule/score matching → organizer dashboard**.

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` + optional `HACKMATE_ADMIN_TOKEN`.
2. `npx prisma db push`
3. `npm run db:seed` (demo participants for **Tech Europe Demo**)
4. `npm run dev` → open `/dashboard`

## Endpoints (selected)

- `POST /api/participants/upload-csv` — multipart `file`
- `POST /api/campaigns/start` — `{ hackathonName }`
- `POST /api/webhooks/slng/call-ended` — SLNG call-end payload (`participant_id`, transcript, consent, …)
- `POST /api/matching/generate` — `{ hackathonName }`
- `POST /api/teams/finalize` — `{ hackathonName }`
- `GET /api/export/final-teams?hackathon=…` (also `participants`, `unmatched`, `calls`)

Set `PIONEER_INFERENCE_URL` + `PIONEER_API_KEY` to replace the built-in heuristic extractor.

## Scripts

- `npm run db:push` / `npm run db:seed`
- `npm run build` / `npm start`
# HackMate
# HackMate
