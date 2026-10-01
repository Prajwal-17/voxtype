# VoxType API

Workers + Hono + D1 + Drizzle + Better Auth (Google, allowlisted).

## Setup

```sh
cd apps/api
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Local: `http://localhost:8787`, reports `environment: development`, uses
Wrangler's local D1 state.

`.dev.vars`: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`

Redirect URI: `http://localhost:8787/api/auth/callback/google`

## Deploy

Dev is local-only — no cloud worker or D1.

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

`POST /v1/speech/token` grants a 60-second Deepgram JWT for a direct Android WebSocket.
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

Body: `{ id?, text, originalText?, createdAt?, durationMs?, delivery? }`. Server computes word count.
