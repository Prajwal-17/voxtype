# VoxType for Android

The app keeps the active keyboard. Its accessibility service shows a small muted bubble near an editable field. The muted, translucent bubble docks to the nearest screen edge after dragging. It remembers its edge and relative height, stays above the keyboard, and expands inward while recording. Dropping it on the ✕ close mark stops recording and turns it off. A tap immediately starts a microphone foreground session and saves a private WAV file. While credentials and the socket connect, a bounded queue holds up to 32 seconds of 16 kHz PCM; the queue is sent in order before live audio. Finish works during connection setup, flushing recorded audio before `Finalize`. Cancel drops the queue and retires its socket. While listening the bubble expands to ✕ cancel and ■ stop controls with a rolling waveform driven by microphone PCM, a short width transition, press feedback and gentle docking haptics. System reduced-motion settings disable animated movement. Finishing sends Deepgram `Finalize`; the finished transcript is inserted through Android 13's accessibility input connection if the same safe field still has focus. A transcript stays in local SQLite when insertion cannot be verified, with Copy and Paste recovery in the app. Password and sensitive fields are excluded.

## Configuration

- Requires Android 13+ (API 33). This is a local Expo module, so the native service needs a development client or installed app; Expo Go cannot run it.
- `EXPO_PUBLIC_API_URL` sets the Worker URL. It defaults to the production VoxType Worker. It contains no provider secret. For an Android emulator using a local Worker, use `http://10.0.2.2:8788` and appropriate local network settings.
- The Worker needs `DEEPGRAM_API_KEY` and `DEEPSEEK_API_KEY` as Wrangler secrets, plus its existing Google and Better Auth secrets. The Deepgram key must support `/v1/auth/grant`.
- Google sign-in uses a fixed Worker OAuth callback followed by `voxtype://auth/callback` with a one-time grant. The signed bearer session is encrypted with Android Keystore. Google OAuth redirect URIs still point to the Worker's `/api/auth/callback/google`.

The Deepgram socket remains open for seven minutes after the last completed dictation, with the idle deadline reset after each take; active recording never expires at the idle deadline. Idle KeepAlive text frames are sent every four seconds; a dropped socket gets a fresh short-lived token on reconnect. Connection setup is bounded to 20 seconds. Failed or unconfirmed sessions retire their socket so late results cannot enter another take. The microphone is released between dictations. DeepSeek cleanup is optional and falls back to the original transcript.

All transcripts stay in local SQLite. The newest 10 WAV files stay in private storage; each new saved recording deletes older audio and clears its file reference without removing transcripts. Version 2 upgrades the existing database without deleting history and replaces the old 5/10/15 preference with the fixed limit of 10.

SQLite remembers which transcripts have not been sent. Finishing a new transcript makes one upload pass for it and all previously unsent transcripts. Failed sends wait until the next new transcript; startup, sign-in, and delivery changes do not send anything, and there is no background scheduler. Each `PUT /v1/dictations/:id` contains text and metadata with `source: mobile`; its stable ID prevents duplicates when a failed send is tried again. Uploads are scoped to the original account and API URL. The app never downloads transcripts from the server. Audio never goes to the Worker; optional cleanup sends only the finished transcript.

## Checks without an Android build

```sh
pnpm --filter @voxtype/mobile check-types
pnpm --filter @voxtype/mobile lint
```

Recording and system overlays require Android. The web preview checks layout with empty data; installed apps show transcripts from this phone's local store.

## Android device test steps

Native behavior remains to be checked on an Android device; these steps are for that check, not evidence that it passed.

1. Install a development client or app on Android 13 or newer, with Worker secrets configured. Sign in through Google and confirm the account appears; sign out and sign in again.
2. Enable **VoxType voice bubble** in Accessibility settings and grant the microphone permission. Keep the normal keyboard selected.
3. Open a normal text field in another app, place the cursor in the middle of existing text, tap the bubble, immediately speak, then tap ■ stop. Repeat on a slow connection and finish before the socket opens; confirm the first words and one transcript appear at the cursor and the keyboard did not change. Tap ✕ cancel during connection setup and confirm that take never appears in the next dictation.
4. Repeat two short dictations back to back on the same socket. Verify the first text never appears in the second. Wait at least four seconds idle, then repeat. After seven minutes, verify a later dictation reconnects.
5. Move focus to a different field while recording. Confirm VoxType stops and saves the transcript without inserting into the new target. Tap the bubble's Copy recovery action or open VoxType and use Copy, then paste with the existing keyboard.
6. Focus password, PIN, and verification-code fields. Confirm no bubble appears and no transcript can be pasted there. Try a field that rejects insertion and confirm recovery text remains in VoxType.
7. Dictate with cleanup enabled, then simulate a DeepSeek failure. Confirm the original transcript survives. Save more than 10 recordings and verify only the newest 10 WAV files remain while every transcript stays in local history. Go offline before a finished transcript is uploaded, restart the app, and reconnect. Confirm no upload happens until the next new transcript; then confirm both transcripts reach the server with a mobile tag and no audio. Confirm no server transcripts appear in local history.
8. Test offline and socket-drop cases, app backgrounding, sign-out during recording, larger system text, reduced motion, landscape, and one tablet or foldable width.

## Interface and native checks

Home has an explicit foreground recorder; it requires microphone permission only.
The separate voice bubble requires accessibility access and an open, focused, safe text
field with the keyboard visible. Backgrounding stops an in-app recording. Transcripts
load from this account's local SQLite database in pages of 12.

The phone web preview is available with `pnpm --filter @voxtype/mobile exec expo start --web`.
It uses empty preview data and disables Android-only recording and permission actions.

To compile the native module without a device, run Expo prebuild for Android, then
`./gradlew :voxtype-native:compileDebugKotlin` in the generated `android` folder.
Set `ANDROID_HOME` to a working SDK path. Generated Android/build directories are ignored;
app icons and splash configuration live in `app.json` and `assets`.

## Bubble checks

From the generated Android directory, run:

```sh
./gradlew :voxtype-native:testDebugUnitTest :voxtype-native:lintDebug \
  -x :react-native-worklets:lintAnalyzeDebug \
  -x :expo-modules-core:lintAnalyzeDebug
```

The exclusions avoid the existing upstream Kotlin lint crash; they do not skip VoxType
source analysis. Seven JVM tests cover edge selection, expansion anchoring, keyboard
and rotation bounds, tiny windows, PCM silence, amplitude and signed sample decoding.

On a device, drag from both the idle circle and recording controls; release near either
edge and in the middle. Check that the bubble docks, remains above the keyboard, and
keeps its edge during expansion, rotation and reopening. Speak quietly/loudly and pause
to check waveform response. Check tap vs drag, interrupted drags, drop-to-close, system
reduced motion and haptic settings. These native interactions cannot be verified in the
Expo web preview.
