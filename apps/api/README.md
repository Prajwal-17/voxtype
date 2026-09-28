# VoxType API

Workers + Hono + D1 + Drizzle + Better Auth (Google, allowlisted).

## Setup

```sh
cd apps/api
cp .dev.vars.example .dev.vars
pnpm wrangler d1 create voxtype # put ID in wrangler.jsonc
pnpm db:migrate:local
pnpm dev
```

Local development runs on `http://localhost:8787`, reports `environment: development`, and uses
Wrangler's local-only D1 state. It does not read or write the deployed production D1 database.

`.dev.vars`: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Redirect URI: `http://localhost:8787/api/auth/callback/google`

Production is an explicit Wrangler environment. Replace the sentinel `API_URL`, `CLIENT_ORIGINS`,
and D1 `database_id` values under `env.production`, add
`https://<api>/api/auth/callback/google`, and configure its secrets with
`wrangler secret put --env production`. Then run `pnpm db:migrate:remote` and
`pnpm run deploy`.
Both commands validate the production block first and cannot fall back to the localhost config. A
remote `API_URL` reports `environment: production`.

## Auth

`/api/auth/*`. Desktop/mobile: `Set-Auth-Token` → `Authorization: Bearer <token>`.

Desktop Google sign-in opens `/api/desktop-auth/start` in the system browser. The callback sends a
short-lived, single-use token to VoxType's loopback listener; Rust exchanges it for the signed
session and stores that session only in the operating-system keyring.

## Endpoints

All `/v1/*` require auth, except `GET /health`.

| Method   | Path                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`, `/v1/me`, `/v1/dictations?limit=&cursor=&q=`, `/v1/dictations/:id`, `/v1/analytics?range=7d\|30d\|all` |
| `POST`   | `/v1/dictations`                                                                                                  |
| `PUT`    | `/v1/dictations/:id`                                                                                              |
| `DELETE` | `/v1/dictations/:id`, `/v1/dictations`                                                                            |

Body: `{ id?, text, originalText?, createdAt?, durationMs?, delivery? }`. Server computes word count.
