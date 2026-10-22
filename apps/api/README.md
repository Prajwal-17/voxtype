# VoxType API

Cloudflare Workers API built with Hono, D1, Drizzle, and Better Auth. Handles Google
sign-in, transcript sync, analytics, and speech credentials. Provider keys stay here.

## Setup

Install dependencies using the [workspace setup](../../README.md#quick-start).
Copy [`.dev.vars.example`](.dev.vars.example) to `apps/api/.dev.vars` and fill in
the Google, Better Auth, Deepgram, and DeepSeek secrets.

In `apps/api/wrangler.jsonc`, set `ALLOWED_EMAIL` and `AUTH_URL`. Register
`<AUTH_URL>/api/auth/callback/google` in your Google OAuth client. The auth URL must
be reachable by the sign-in browser; the current default uses a development tunnel.

## Development

Run from the repository root:

```sh
pnpm exec turbo run db:migrate:local --filter=@voxtype/api
pnpm exec turbo run dev --filter=@voxtype/api
```

Starts the API at `http://localhost:8787` with local D1 data. Reapply migrations
after schema changes. Google sign-in and speech services require internet access.

Account sessions last 90 days. Authenticated API activity renews an unexpired session
at most once per day, so regular use keeps the existing desktop/mobile bearer valid.
Expired or revoked sessions require Google sign-in again.

## Production

Configure the `production` environment in `wrangler.jsonc` with your D1 database,
API/auth URLs, allowed email, and client origins. Add production Worker secrets
matching `.dev.vars.example` and register the production OAuth callback. Apply
production migrations before deploying; both operations target `--env production`.
