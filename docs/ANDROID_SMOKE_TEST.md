# Android Emulator Smoke Test

Proves the app **actually launches on a real Android system image** and paints
its first route without a runtime error. This is the gate that catches the
class of failure a compile check cannot see — the
`AppRegistry.runApplication()` / "bad application bundle" crash, a broken
polyfill, a missing native module, a throw inside the root layout.

```
compile gate  →  scripts/validate-android.mjs      (does the bundle build?)
launch gate   →  scripts/android-smoke-test.mjs    (does the app run?)
```

## Run it locally

```bash
# 1. an emulator must be running (Android Studio, or:)
emulator -avd Pixel_6_API_34 -no-snapshot-save -gpu swiftshader_indirect &

# 2. build a debug APK with the JS bundled in (no Metro required)
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug && cd ..

# 3. launch + assert
npm run smoke:android
```

Shortcut that does all three: `npm run smoke:android:full`

## What it asserts

The app emits four one-line markers to `adb logcat` from
`services/smokeBeacon.ts`:

| Marker                  | Meaning                                          |
| ----------------------- | ------------------------------------------------ |
| `BUTLER_SMOKE:BOOT`     | JS bundle evaluated, root layout module loaded    |
| `BUTLER_SMOKE:MOUNT`    | root React tree committed                         |
| `BUTLER_SMOKE:ROUTE_OK` | first route resolved and painting (`home` / `onboarding`) |
| `BUTLER_SMOKE:READY`    | 1.2 s settle window passed with **zero** errors   |

The run passes only when `READY` arrives **and** the process is still alive
afterwards. It fails immediately on any of:

- `BUTLER_SMOKE:ERROR` — any JS error, unhandled rejection, or real `console.error`
- `FATAL EXCEPTION` / `AndroidRuntime` exception
- `Attempting to call JS function on a bad application bundle`
- `Unable to load script` / `Could not connect to development server`
- `ANR in …` or the process dying
- 180 s timeout with no `READY`

## Evidence

Every run writes `artifacts/android-smoke/`:

- `logcat.txt` — full filtered device log
- `first-route.png` — screenshot of what actually rendered
- `result.json` — machine-readable verdict

CI uploads that folder plus the debug APK as the `android-smoke-evidence`
artifact, on pass **and** fail. When a run goes red, open `first-route.png`
first: it usually shows the exact broken frame.

## CI

`.github/workflows/android-smoke-test.yml` runs on every push, PR and manual
dispatch. It uses `reactivecircus/android-emulator-runner` with a **cached AVD
snapshot** and a cached Gradle home, so after the first green run the whole job
is roughly 8–12 minutes instead of 30+.

## Cost note

The emulator job is the expensive one. It is separated from
`android-build-validation.yml` on purpose: the cheap compile gate runs on
everything, and if it fails the emulator never boots.

## Beacon overhead in production

None worth measuring. `smokeBeacon.ts` renders nothing, stores nothing, and
keeps no timers alive; it wraps (never replaces) the existing global error
handler so `bootGuard` and the crash logger behave exactly as before. On a
user's device the markers are just log lines nobody reads. If you ever want
them gone entirely, delete the two `installSmokeBeacon()` / `smokeMounted()`
calls in `app/_layout.tsx` and the `smokeFirstRoute()` call in
`app/(tabs)/_layout.tsx`.
