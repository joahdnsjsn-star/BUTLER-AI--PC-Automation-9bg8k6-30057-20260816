# Butler AI — v5 Core (onspace.ai compatible)

Clean rewrite focused on the three core flows:

- **Chat** — talk to your local Ollama model
- **Connect** — point Butler at your PC (host / port / token / HTTPS)
- **Settings** — default model, system prompt, reset

## Stack
- Expo SDK 53 + Expo Router 5 (file-based routing under `app/`)
- React Native 0.79 / React 19
- TypeScript strict
- AsyncStorage for local preferences
- No native modules outside the onspace.ai-supported set

## Endpoints
The connection layer targets the standard Ollama REST API:
- `GET  /api/tags`  → connection test
- `POST /api/chat`  → chat completion (non-streaming)

## Run
```
bun install      # or npm install
bun expo start   # or npx expo start
```

## Project layout
```
app/
  _layout.tsx          # root stack + splash + safe-area
  +not-found.tsx
  (tabs)/
    _layout.tsx        # bottom tabs
    index.tsx          # Chat
    connect.tsx        # Server config + ping
    settings.tsx       # Model / system prompt / reset
services/
  storage.ts           # safe AsyncStorage wrapper
  connection.ts        # ServerConfig, fetchWithAuth, pingServer
  chat.ts              # sendChat against Ollama
constants/
  theme.ts             # dark palette tokens
```

## onspace.ai compatibility checklist
- `main` is `expo-router/entry`
- `app.json` uses `expo-router` plugin and `metro` web bundler
- All dependencies pinned to Expo SDK 53 compatible versions
- No `child_process`, `fs`, `node:` imports, or web-only APIs in app code
- `tsconfig.json` extends `expo/tsconfig.base`
