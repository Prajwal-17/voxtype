# Client data and recovery

Cleaned transcript history continues to sync to the signed-in account. Original audio, raw pre-cleanup text and transcription/delivery diagnostics are device data. They are never added to history upload DTOs. Optional wording cleanup still uses the existing cleanup endpoint.

## Local recordings

Transcripts → **Local recordings & originals** lists the signed-in account's locally retained takes. Play or export its WAV, copy original text, or choose **Regenerate text**. Both platforms retain at most ten originals and ten completed WAV files across the device. Signing into another account cannot reveal the previous account's entries; new takes can evict older entries from the device-wide limit.

Android stores originals separately in SQLite `local_recordings` (schema version 3). The upgrade copies up to ten existing local originals before clearing the old sync-cache column. Desktop stores recovery separately from its cleaned-history/upload store, with a startup migration for existing device recordings. Restored cloud originals are ignored. The API preserves an already-stored original when a cleaned-only retry omits that field; no remote data migration or removal is performed.

Deleting a synced cleaned transcript leaves its independent local recovery take until normal pruning. Recovery references whose audio has been pruned show audio as unavailable. Explicit cancellation and payment pause retain the existing discard behavior. Provider errors and handled microphone/service interruptions preserve captured audio and any received raw text. Android checkpoints the WAV when capture stops, before waiting for final transcription or cleanup, including late stop callbacks after an error or a new take. Failed takes can be recovered without a cleaned-history row. Abrupt process termination or power loss before the WAV is finalized is not covered by this recovery path.

Playback reads only device audio and pauses when recording starts or the view closes. Regeneration is an explicit network action: it sends the owned WAV directly to the existing speech provider using a temporary token, then applies the current cleanup setting. Audio is never uploaded to VoxType history storage. Only one regeneration runs at a time; files are bounded at 64 MB and provider requests time out after three minutes. A successful result replaces the same history ID and local raw original while preserving the take's date, duration and audio. An audio-only failed take gains its first cleaned transcript under that same ID. Only cleaned text syncs. Regeneration never inserts into another app or overwrites the clipboard. A failed or empty result preserves existing text and audio; account changes and pruning reject late results.

Audio export uses Android's share sheet or a desktop file chooser. The desktop package includes Zenity, also used by the existing insights exporter. Exported files are user-controlled copies outside automatic retention.

## Local diagnostics

Settings (Desktop tab on desktop) offers **Copy diagnostics** and **Export diagnostics**. Each record contains a timestamp and a fixed event code for recording, transcription, cleanup fallback, delivery/recovery, clipboard failure, save failure or cancellation. Reports include the installed app version. They exclude transcript text, tokens, email addresses, account IDs, target app/field contents, exception messages and stack traces.

Storage is capped at 500 events across the device and expires entries at 14 days. Pruning runs on writes/reads and app startup/foreground on Android, and also during desktop periodic maintenance. Reports are filtered to the current account and omit internal ownership metadata. Diagnostics have no server upload, database route or automatic delivery. OS share sheets/file choosers open only after an explicit export action.

## Refresh policy and versions

Mobile shares in-flight analytics requests and keeps bounded in-memory results for two minutes. Keys include account, API origin, range, timezone and local calendar date. Account changes discard cached and pending ownership; responses verify the captured native session. Foreground account checks share one request and avoid re-verification within one minute. Native cloud-history refreshes use a two-minute account-scoped cooldown; new transcript uploads are not delayed by it.

Desktop uses React Query's shared account/range/timezone/date keys with two-minute freshness. Bootstrap remains cached until explicitly invalidated. Local history and delivery events invalidate local views; only confirmed cloud changes invalidate analytics. Desktop batches cloud changes into one notification, even after a partially failed sync, and avoids downloading unchanged cloud history on every take. Both clients coalesce native event bursts. Failed requests can retry and do not become fresh cache entries.

Mobile Settings displays the installed package version name and version code, including development suffixes; web preview falls back to Expo configuration. Desktop Settings displays the runtime Cargo version; browser preview uses the Tauri configuration version. Build-source consistency and installed Android version reporting have regression coverage.

## Verification

Automated coverage includes request sharing, interrupted requests, cache expiry/eviction, account/range/API/timezone/date isolation, local/cloud invalidation separation, SQLite upgrade/restart/pruning, WAV account access, clean-only upload payloads, preservation of old remote originals, diagnostics redaction/bounds/expiry and version consistency.

Browser checks with simulated native bridges verified repeated Home/Insights navigation uses one analytics request on each platform; unrelated local state changes add no analytics requests; a cloud completion burst adds one. They also exercised decoded WAV playback, failed regeneration followed by successful text replacement, recovery copy/audio export, diagnostics copy/export, account switching, payment-pause UI, runtime version labels, and mobile layout at 360px with 48px action targets and no horizontal overflow. Android retry tests send a four-minute WAV through a simulated provider transport, verify repeated replacement without duplicate rows, and cover failed/empty responses, concurrent retries, cancellation, late stop callbacks, account changes and pruning during requests.

The local Android library harness uses the production Kotlin sources/resources/assets and complete native test suite, with only the Expo module/event bridge stubbed. It covers existing chat editors, duplicate prevention, sensitive fields, payment pause, cancellation and bubble recovery. The full local Expo build is blocked by HTTP 403 when React Native's artifact redirects to `repo.reactnative.dev`; this harness does not validate the real Expo bridge or installed APK integration. Native Linux tests and the real Xvfb clipboard round trip pass. No physical Android device was attached: microphone/provider operation, actual Android share sheets and insertion into ChatGPT, T3 Code, Google AI Mode and payment apps still require device validation.
