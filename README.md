# VoxType

VoxType is a dictation app for Linux and Android. It turns speech into text
in the app you're using, with Google sign-in and shared transcript history.

## Product preview

Screenshots from the local desktop browser preview with a fictional account, seeded
transcripts, and sample activity. Microphone capture and automatic paste run in the installed
app.

![VoxType transcript list with sample dictations and inline copy actions](https://github.com/Prajwal-17/voxtype/releases/download/readme-screenshots-2026-10-19/voxtype-transcripts-cfd4fc1.png)

<details>
<summary>More screenshots</summary>

### Dictation workspace

The recording workspace, recent transcripts, and activity at a glance.

![Dictation workspace](https://github.com/Prajwal-17/voxtype/releases/download/readme-screenshots-2026-10-19/voxtype-home-cfd4fc1.png)

### Insights

Word counts, dictation speed, activity history, and daily trends.

![Insights](https://github.com/Prajwal-17/voxtype/releases/download/readme-screenshots-2026-10-19/voxtype-insights-cfd4fc1.png)

</details>

## Capabilities

- Desktop dictation with a global shortcut and automatic paste
- Android voice bubble that works with your existing keyboard
- Transcript history, insights, and optional text cleanup

## Quick start

Use Node.js 24+ and the pnpm version declared in `package.json`. Complete the
[desktop prerequisites](apps/desktop/README.md#setup) or [Android prerequisites](apps/mobile/README.md#setup).
Run all commands from the repository root.

1. Install workspace dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Copy the API environment example:

   ```sh
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   ```

   Fill in `apps/api/.dev.vars` with your credentials:

   ```dotenv
   BETTER_AUTH_SECRET=<random-secret-at-least-32-characters>
   GOOGLE_CLIENT_ID=<google-client-id>
   GOOGLE_CLIENT_SECRET=<google-client-secret>
   DEEPGRAM_API_KEY=<deepgram-api-key>
   DEEPSEEK_API_KEY=<deepseek-api-key>
   ```

3. In the local `vars` section of `apps/api/wrangler.jsonc`, set `ALLOWED_EMAIL`
   to your Google account and `AUTH_URL` to `http://localhost:8787` for desktop
   sign-in, or a reachable HTTPS tunnel for phone testing. Register
   `<AUTH_URL>/api/auth/callback/google` in your Google OAuth client's redirect URIs.

4. Apply local migrations and start the API and VoxType Dev desktop app:

   ```sh
   pnpm exec turbo run db:migrate:local --filter=@voxtype/api
   pnpm exec turbo run dev --filter=@voxtype/api --filter=@voxtype/desktop
   ```

   The API runs at `http://localhost:8787`. For Android, use the
   [mobile development steps](apps/mobile/README.md#development).

## Project documentation

- [Desktop setup and build](apps/desktop/README.md)
- [Android setup and build](apps/mobile/README.md)
- [API configuration](apps/api/README.md)
- [Shared package](packages/shared/README.md) and [design system](DESIGN_SYSTEM.md)
