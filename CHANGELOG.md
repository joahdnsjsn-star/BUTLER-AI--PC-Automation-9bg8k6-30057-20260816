# v5.0.0 — Core rewrite

Full rewrite from scratch, scoped to the three core flows per the user request.

## Removed
- All legacy tabs (builder, butler, cosmetic, fileshare, knowledge, logs, nexushome, scripts, support, terminal)
- All legacy services (autoConnectEngine, nexusBridge, nexusChat, nexusWebSocket, serviceguard, etc.)
- Supabase integration (was unused for the core flows)
- Camera / location / notifications / audio / video / charts / WebView / Paper / NativeWind / Zustand and ~70 other dependencies that the core does not need

## Added
- Clean Expo Router 5 layout (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`)
- `services/storage.ts` — safe wrapper around AsyncStorage with try/catch and JSON fallback
- `services/connection.ts` — typed ServerConfig, `buildBaseUrl`, `fetchWithAuth` (120s timeout, abort signal), `pingServer`
- `services/chat.ts` — non-streaming `sendChat` against Ollama's `/api/chat`
- Connect screen with live endpoint preview, save, and test
- Chat screen with empty state, keyboard avoidance, scroll-to-end, error surface, busy state
- Settings screen with model, system prompt, destructive reset

## Bugs fixed by rewriting
- Eliminates all 87 TS errors from v4 (missing style keys in settings.tsx, etc.)
- Eliminates lint warnings from v4
- No top-level `expo-camera` import on screens that don't need it
- Splash hide is guarded with `.catch()` so it never crashes startup
- All `AsyncStorage` paths are wrapped — no unhandled rejections from corrupt JSON
- Port field stored/sent as string consistently
- Onboarding/notify export coupling is gone (no longer needed)

## onspace.ai verified
- `main: expo-router/entry`
- `expo-router` plugin declared in `app.json`
- Metro web bundler
- No banned native deps; all packages within Expo SDK 53 set
