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

`.dev.vars`: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_IDS` (web first), `GOOGLE_CLIENT_SECRET`

Redirect URI: `http://localhost:8787/api/auth/callback/google`

Prod: set `API_URL` / `CLIENT_ORIGINS`, add `https://<api>/api/auth/callback/google`, `wrangler secret put`, `pnpm db:migrate:remote`.

## Auth

`/api/auth/*`. Desktop/mobile: `Set-Auth-Token` → `Authorization: Bearer <token>`.

## Endpoints

All `/v1/*` require auth, except `GET /health`.

| Method | Path |
| --- | --- |
| `GET` | `/health`, `/v1/me`, `/v1/dictations?limit=&cursor=&q=`, `/v1/dictations/:id`, `/v1/analytics?range=7d\|30d\|all` |
| `POST` | `/v1/dictations` |
| `PUT` | `/v1/dictations/:id` |
| `DELETE` | `/v1/dictations/:id`, `/v1/dictations` |

Body: `{ id?, text, originalText?, createdAt?, durationMs?, delivery? }`. Server computes word count.
