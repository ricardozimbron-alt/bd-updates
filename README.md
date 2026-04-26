# BD updates

A personal regulatory monitor and BD draft inbox. Polls UK and EU competition
publications, classifies events against a taxonomy, runs a two-pass relevance
check per client, drafts personalised notes for human review, and surfaces
them in an inbox-style UI.

Single user, magic-link auth. No multi-tenant features. No outbound mail to
clients — drafts are copied to clipboard for the user to send manually.

## Layout

```
prisma/         schema + seed
lib/            shared types, prisma client, prompts, relevance, drafter
worker/         long-running poller (Node + node-cron) — deploys to Fly (lhr)
web/            Next.js 15 app — deploys to Vercel (fra1)
```

Source adapters live in `worker/sources/` and implement the `Source` interface.
See `worker/sources/README.md`.

## Setup

```sh
pnpm install
cp .env.example .env
# fill in DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY,
# OWNER_EMAIL, AUTH_SECRET, NEXTAUTH_URL
pnpm db:push
pnpm db:seed
pnpm dev          # runs web on :3000 and worker concurrently
```

## Commands

| | |
|--|--|
| `pnpm dev` | run web + worker locally |
| `pnpm typecheck` | typecheck all packages |
| `pnpm test` | run unit tests |
| `pnpm db:push` | apply schema to the database |
| `pnpm db:seed` | seed one synthetic client |
| `pnpm db:studio` | open Prisma Studio |
| `pnpm --filter @bdu/worker poll-once <id>` | run one source poll, print to stdout (no DB) |
| `pnpm --filter @bdu/worker process-pending` | process pending events through Claude (needs DB + ANTHROPIC_API_KEY) |

## Deployment

- **Database** — Neon project in Frankfurt or Dublin. Use the pooled URL.
- **Web** — Vercel, region `fra1` (pinned in `vercel.json`). Connect the repo
  and set the env vars from `.env.example`.
- **Worker** — Fly.io, region `lhr`. From `worker/`:
  ```sh
  fly launch --copy-config --no-deploy --name <your-app>
  fly secrets set DATABASE_URL=… ANTHROPIC_API_KEY=… RESEND_API_KEY=… \
                  RESEND_FROM=… OWNER_EMAIL=… AUTH_SECRET=… NEXTAUTH_URL=…
  fly deploy
  ```
- **Resend** — verify a sending domain in the EU region; copy the API key into
  both Vercel and Fly env.

## Authentication

`OWNER_EMAIL` is the only address that can sign in. Magic links are sent via
Resend. Sessions last 30 days.
