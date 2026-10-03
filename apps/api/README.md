# VoxType API

Workers + Hono + D1 + Drizzle + Better Auth (Google, allowlisted).

## Setup

```sh
cd apps/api
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Local: `http://localhost:8788`, reports `environment: development`, uses
Wrangler's local D1 state. The API and inspector ports are configured in
`wrangler.jsonc` as `8788` and `9230` to coexist with other local Workers.

`.dev.vars`: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`

Add `http://localhost:8788/api/auth/callback/google` to the Google OAuth client's
authorized redirect URIs for local sign-in.

## Deploy

Dev is local-only — no cloud worker or D1.

The default Wrangler target is `voxtype-api-local`, with workers.dev and preview URLs disabled,
an explicitly local D1 binding, and no real cloud database ID. `pnpm dev` uses `wrangler dev --local`
to disable remote bindings. Local secrets remain in the ignored `.dev.vars` file. Desktop and
mobile development builds both use `http://localhost:8788` by default; Android uses
`adb reverse tcp:8788 tcp:8788` to reach it. Google and speech providers still require network access.

Cloud deployment and migrations must explicitly select `env.production` through the scripts below.

Prod (`env.production`) is remote. Fill `API_URL`, `CLIENT_ORIGINS`,
D1 `database_id` (from `pnpm wrangler d1 create voxtype-production`), set prod
secrets, add the prod `/api/auth/callback/google` redirect, then:

```sh
pnpm db:migrate:remote
pnpm deploy:production
```

## Auth

`/api/auth/*`. Desktop/mobile: `Set-Auth-Token` → `Authorization: Bearer <token>`.

Desktop Google sign-in opens `/api/desktop-auth/start` in the system browser. The callback sends a
short-lived, single-use token to VoxType's loopback listener; Rust exchanges it for the signed
session and stores that session only in the operating-system keyring.

Android sign-in opens `/api/mobile-auth/start?state=<uuid>` in the system browser. The fixed
callback returns a single-use grant to `voxtype://auth/callback`; the app checks the state,
exchanges the grant, and stores the bearer session in Android secure storage.

`POST /v1/speech/token` grants a 60-second Deepgram JWT for a direct desktop or Android WebSocket.
`POST /v1/speech/cleanup` optionally cleans text with DeepSeek and returns the original on
provider failure. Neither endpoint stores audio or transcripts. Set provider keys as Worker
secrets with `wrangler secret put ...`; never place them in Expo configuration.

## Endpoints

All `/v1/*` require auth, except `GET /health`.

| Method   | Path                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`, `/v1/me`, `/v1/dictations?limit=&cursor=&q=`, `/v1/dictations/:id`, `/v1/analytics?range=7d\|30d\|all` |
| `POST`   | `/v1/dictations`                                                                                                  |
| `PUT`    | `/v1/dictations/:id`                                                                                              |
| `DELETE` | `/v1/dictations/:id`, `/v1/dictations`                                                                            |

Body: `{ id?, text, originalText?, createdAt, durationMs, source }`, where
`source` is `desktop` or `mobile`. Server computes word count. Audio, recording paths, and unknown
fields are rejected.

Both apps save locally first and push using `PUT /v1/dictations/:id`. Stable IDs make retries
idempotent. Desktop 0.1.4 and mobile 0.0.6 restore account history through the paginated GET endpoint after sign-in.
Desktop deletion removes the server record before the local cache; complete sync passes reconcile
cloud deletions without removing pending uploads. The server stores transcript text and metadata,
not audio recordings or device preferences.

Apply database migrations through `pnpm db:migrate:local` for development and
`pnpm db:migrate:remote` before deploying the production Worker.
