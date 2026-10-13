# VoxType Mobile

Expo and React Native app for Android dictation. Its native voice bubble inserts
text into the active field while keeping your existing keyboard.

## Setup

Follow the [workspace setup](../../README.md#quick-start) and [API setup](../api/README.md#setup).
Use Android 13+, JDK 17, and an Android SDK with `adb` on your path. Set
`ANDROID_HOME` to your SDK location and connect an emulator or USB debugging device.
Expo Go cannot run the native module.

## Development

With the local API running, build and launch from the repository root:

```sh
adb reverse tcp:8787 tcp:8787
APP_VARIANT=development pnpm exec turbo run android --filter=@voxtype/mobile
```

Installs **VoxType Dev** and starts Metro. Development uses `http://localhost:8787`;
set `EXPO_PUBLIC_API_URL` to use another API. The API's `AUTH_URL` must also be
reachable from the phone for Google sign-in.

Sign in, grant microphone permission, and enable **VoxType Dev voice bubble** in
Android accessibility settings.

## Build

Run [Android Development Build](../../.github/workflows/mobile-dev-build.yaml) in
GitHub Actions with your branch and HTTPS API origin. Install the APK artifact;
it includes the JavaScript bundle and runs without Metro.
