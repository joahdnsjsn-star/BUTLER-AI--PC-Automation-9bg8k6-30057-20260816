# Butler AI — Codebase Index & AI Workflow Guide

> **CODEBASE** = secret keyword that activates ALL AI tools + credit-saving strategies.
> When a user says "codebase", apply ALL of the following simultaneously.

---

## ⚡ PERSISTENT CODING TOOLS (ALWAYS ACTIVE — AUTO-LOADED EVERY SESSION)

> These files exist in `tools/` and must be consulted BEFORE doing any work.
> Reading them costs ~2k tokens total vs 50-200k reading source files.

| Tool File | Purpose | Read When |
|-----------|---------|----------|
| `tools/FUNCTION_MAP.md` | ALL service exports, hooks, contexts, server API, component props | BEFORE reading any service/hook file. "Where is X?" questions |
| `tools/PATTERNS.md` | Copy-paste code patterns (cards, fetch, animations, layouts) | BEFORE writing any new component or boilerplate |
| `tools/DIFF_STATE.md` | Which files changed recently + known issues watch list | BEFORE reading any file — may already be in "STABLE" state |
| `tools/AUTO_TOOLS.md` | Rules for using tools efficiently + credit savings scorecard | When unsure which approach saves most credits |
| `tools/codebase-ref.ts` | Machine-readable JSON map of all singletons, routes, storage keys | Quick lookup for import paths |

### MANDATORY SESSION START PROTOCOL (run in parallel, costs ~2k tokens)
```
Step 1: Read tools/FUNCTION_MAP.md   — know all exports, never re-read services
Step 2: Read tools/DIFF_STATE.md     — know what changed, skip stable files  
Step 3: (optional) tools/PATTERNS.md — if writing new components
```

### CREDIT SAVINGS RULES
1. **Check FUNCTION_MAP before ANY `read_file` on a service** — 95% of the time the answer is already there
2. **Check DIFF_STATE before re-reading a tab file** — if STABLE, use prior session context
3. **ALL searches run in parallel** — never sequential `search_files` calls
4. **Server API is cached in FUNCTION_MAP** — never fetch `butler_server_v20_1_0.py` again
5. **Large files (4000+ lines)** — always `search_files` first, read only the target section

### AUTO-MAINTENANCE RULES (update tools/ after every session)
- Add new service exports to `FUNCTION_MAP.md` immediately
- Mark edited files as MODIFIED in `DIFF_STATE.md`
- Add new patterns to `PATTERNS.md` after solving novel layout/animation problems
- Update known issues table in `DIFF_STATE.md` when bugs are found/fixed

---

## 🤖 GEMINI AI — PERMANENT CODING ASSISTANT (ALWAYS ACTIVE)

> **MANDATORY RULE**: Every session where user says "codebase", BEFORE writing any code:
> 1. Run `search_web` with a detailed technical query to get free code examples/patterns
> 2. This replaces calling Gemini directly (fetch_web is GET-only, Gemini needs POST)
> 3. Use the research to inform every code change — saves OnSpace credits every session

**User's Gemini API Key (for reference / server prompts):**
`AQ.Ab8RN6Ks59g1meSwPLipy93HKLhLdmV9aLy0fUk2rkhGp7dvXA`

**Credit-saving workflow (MANDATORY every "codebase" session):**
```
STEP 1: search_web("[feature] React Native TypeScript expo 2025 site:github.com")
STEP 2: search_files(pattern="existing pattern to reuse")
STEP 3: edit_file with ALL changes in ONE call
STEP 4: finish + present_suggestions in SAME parallel block
```

**Free research sources to use instead of burning credits:**
- `search_web("... site:stackoverflow.com")` — battle-tested patterns
- `search_web("... site:github.com")` — real code examples
- `fetch_web(url="https://docs.expo.dev/...")` — official Expo docs
- `fetch_web(url="https://reactnative.dev/docs/...")` — RN docs

**Gemini aistudio prompt URL for user to paste server prompts:**
`https://aistudio.google.com/prompts/new_chat`

---

## 🔑 Credit-Saving & Efficiency Tricks (ALWAYS APPLY)

### 1. Parallel Tool Calls First
- **Search before read**: use `search_files` to find exact line numbers → only `read_file` the specific section
- **Batch all edits**: use `edit_file` with ALL changes in one `edits` array — never call `edit_file` twice for the same file
- **Parallel independent ops**: fire `search_files` + `write_file` + `generate_image` in the same tool block when they don't depend on each other
- **Use context**: if a file was recently read/written, use that content directly — never re-read it

### 2. Search-First Pattern
```
search_files(pattern) → find exact strings → edit_file(old_string=exact match)
```
Never read a 2000-line file just to change 3 lines. Search → precise edit.

### 3. Minimal File Rewrites
- Prefer `edit_file` over `write_file` for any file that already exists
- Only `write_file` for: new files, or when >40% of content changes

### 4. Parallel Finish
Always call `presentation--present_suggestions` and `finish` in the SAME tool block as the last code-changing tool.

---

## 📁 Project Architecture

```
app/(tabs)/          ← Expo Router pages (8 main tabs + onboarding)
services/            ← Data layer — pure TS, no React
hooks/               ← Logic layer — state + business rules
components/ui/       ← UI components
components/cyber/    ← Cyberpunk-themed specialty widgets
constants/           ← theme.ts, config.ts, animations.ts
contexts/            ← CosmeticContext, TabBarContext, LanguageContext
python_server/       ← PC-side server (butler_server.py)
```

## 🗂️ Key Files Quick Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/nexushome.tsx` | Main dashboard — metrics, quick scripts, command grid |
| `app/(tabs)/scripts.tsx` | Script library — 250+ scripts, AI builder, favorites |
| `app/(tabs)/butler.tsx` | AI chat tab — ChatModeBar, sendMessage, ChatStatsStrip |
| `app/(tabs)/_layout.tsx` | Tab bar, AIChatWidget, QR modal |
| `app/(tabs)/onboarding.tsx` | 10-page onboarding flow |
| `app/(tabs)/settings.tsx` | Settings + Remote Access config |
| `services/connectionHub.ts` | **Unified connection service** — wraps serverConnection + autoConnectEngine + features + pcClipboard + qrParser |
| `hooks/useConnection.ts` | **Single React hook** — replaces all scattered isConnected/serverAddr state across tabs |
| `services/serverConnection.ts` | PC pairing, IP/port/token management |
| `services/autoConnectEngine.ts` | Background reconnect engine |
| `services/performanceTuner.ts` | Device tier detection + adaptive fetch/anim config |
| `services/autoResearch.ts` | Debounced KB pre-fetch as user types in chat |
| `services/smartPrefetch.ts` | Pre-warms tab data before user navigates |
| `services/geminiAssist.ts` | Free Gemini 1.5 Flash offline AI fallback |
| `services/pcActionScripts.ts` | Python scripts replacing removed /api/pc-check/* endpoints |
| `services/scriptExecutor.ts` | Script execution + streaming |
| `services/executionHistory.ts` | Run log persistence |
| `components/ui/NexusPageBanner.tsx` | Shared page header with particles |
| `components/ui/NexusGlowButton.tsx` | Reusable glowing CTA button |
| `components/ui/NexusLiveCard.tsx` | Live stats card with sparkline |
| `constants/onboardingKeys.ts` | AsyncStorage key constants |

---

## 🔌 Connection Architecture (UPDATED — use Hub pattern)

### The New Way: ONE import replaces SIX scattered state variables
```tsx
// ❌ OLD (scattered across every tab):
const [isConnected, setIsConnected] = useState(false);
const [serverAddr, setServerAddr] = useState('');
const [ollamaOnline, setOllamaOnline] = useState(null);
// ... + 3 useFocusEffect blocks + autoConnectEngine.on() ...

// ✅ NEW (one line):
import { useConnection } from '@/hooks/useConnection';
const conn = useConnection();
// conn.isConnected, conn.addr, conn.ollamaOnline, conn.caps.power, conn.latencyMs ...
// conn.connect(ip, port), conn.pairQR(data), conn.power('sleep'), conn.execute(script)
```

### connectionHub — service-layer singleton
```ts
import { connectionHub } from '@/services/connectionHub';

// Subscribe (for non-React code)
const unsub = connectionHub.subscribe((state) => { ... });

// Feature gate
if (connectionHub.has('power')) { ... }

// Authenticated fetch — auto-handles token, 401, remote mode
const res = await connectionHub.fetch('/api/execute', { method:'POST', body: JSON.stringify({script}) });

// Execute shortcut
const result = await connectionHub.execute(script, (line) => console.log(line));
```

### HubState shape
```ts
{
  isConnected, engineStatus, ip, port, addr,
  token, serverVersion, schema, ollamaOnline, isRemote,
  latencyMs, lastPingTs, connecting,
  caps: { power, clipboard, keyboard, ollama, crawl, execute, stream }
}
```

---


> ⚠️ ALWAYS use this table. Do NOT call endpoints not listed here — they return 404.

| Endpoint | Method | Body / Params | Purpose |
|----------|--------|---------------|---------|
| `/api/status` | GET | — | Health check + capabilities + feature flags |
| `/api/metrics` | GET | — | CPU/RAM/Disk live data |
| `/api/execute` | POST | `{script}` | Run Python script → `{output, error, success}` |
| `/api/butler/chat` | POST | `{messages:[{role,content}]}` | Ollama AI chat |
| `/api/ollama/status` | GET | — | Ollama running + active model |
| `/api/ollama/pull` | POST | `{model}` | Pull/download an Ollama model |
| `/api/learn/status` | GET | — | KB crawl stats |
| `/api/undo/list` | GET | — | Undoable script executions |
| `/api/undo/rollback` | POST | `{id}` | Roll back execution by ID |
| `/api/clipboard` | POST | `{text?, action:'read'|'write'}` | PC clipboard read/write |
| `/api/keyboard/type` | POST | `{text}` | Type text via pyautogui |
| `/api/power` | POST | `{action, confirm:true}` | sleep/shutdown/restart PC |
| `/api/receive_file` | POST | `{filename, data:base64}` | Send file to PC Desktop |
| `/api/crawl` | POST | `{url, depth?}` | Crawl URL via PC relay |
| `/pair` | POST | `{pairingCode, deviceId}` | Initial QR pairing |
| `/reconnect` | POST | `{deviceId}` | Re-authenticate returning device |
| `/api/reset_pair` | POST | `{pairingCode}` | Unlock server for new device |

**REMOVED endpoints — DO NOT call (returns 404 on server v20):**
- ~~`/api/memory`~~ → use `knowledgeAccumulator.getStats()` locally
- ~~`/api/pc-check/scan`~~ → use `/api/execute` + `PC_SCAN_SCRIPT` from `services/pcActionScripts.ts`
- ~~`/api/pc-check/action`~~ → use `/api/execute` + `PC_ACTION_SCRIPTS[action]`
- ~~`/api/pc_scripts/list`~~ → not on server; app uses local embedded library
- ~~`/api/pc_scripts/run`~~ → use `/api/execute` with script body
- ~~`/api/pc_scripts/get`~~ → not available
- ~~`/api/scripts/library`~~ → not available
- ~~`/api/scripts/build`~~ → use `/api/butler/chat` with code prompt
- ~~`/api/scheduler`~~ → not in v20
- ~~`/api/nexus_brain/status`~~ → not in v20

---

## ⚡ Performance Rules (LOW-END PHONE FRIENDLY)

### Connection Lag Fix
- **Fix pattern**: Use `services/performanceTuner.ts` → `adaptiveFetches()` to stagger calls
- **Lazy mount**: `useState(false)` + `setTimeout(setReady(true), perf.lazyDelay)` after initial render
- **Animation**: `useNativeDriver: true` for opacity/transform; `false` only for color/size

### nexushome.tsx useFocusEffect fetch pattern (CRITICAL)
```typescript
useFocusEffect(useCallback(() => {
  if (!isConnected || !serverAddr) return;
  let active = true;
  let abortCtrl = new AbortController();
  const fetchAll = async () => {
    if (!active) return;
    abortCtrl = new AbortController();
    // all fetches guarded: if (!active) return;
  };
  fetchAll();
  const t = setInterval(fetchAll, pollInterval);
  return () => { active = false; abortCtrl.abort(); clearInterval(t); };
}, [isConnected, serverAddr]));
```

### Fetch Rules
- Home screen: `adaptiveFetches([metrics, ollama, kb])` — not Promise.allSettled
- AIChatWidget: poll interval minimum 6000ms
- Butler script poll: 8s interval (not 6s) — saves battery

---

## 🎨 Design System

Colors (designSystem.ts / local C objects):
- Cyan: `#00DCFF` / `#00E5FF`
- Green: `#00FF88`
- Purple: `#9B40FF` / `#CC44FF`
- Amber: `#FFB020`
- Red: `#FF3131`
- Background: `#020407` / `#060810`

---

## 🧩 Component Patterns

### NexusPageBanner props
```tsx
<NexusPageBanner
  accent="#00DCFF" accent2="#00FF88"
  icon="view-dashboard-variant" iconLib="community"
  title="HOME" subtitle="NEXUS COMMAND CENTER"
  safeTop={insets.top} isConnected={boolean}
  badge="LIVE" badgeColor="#00FF88"
  rightAction={{ icon: 'qr-code-scanner', onPress: fn, color: '#00DCFF' }}
  themeExtra={<ReactNode />}
/>
```

### Tab switching (global)
```ts
(global as any).__butlerSwitchTab?.('scripts')
```

### Cosmetic theme
```ts
const { T } = useCosmetic();
// T.primary, T.bg, T.panel, T.text
```

---

## 💬 Chat Mode Selector (Butler AI Tab)

- `CHAT_MODES` array — 4 modes: general / code / debug / analyze
- `finalKbCtx` = `modePrompt + kbCtx` — built **BEFORE** `systemPrompt` array
- `ChatModeBar` renders **ONCE** in fixed bottom section, **NOT** inside ScrollView

```ts
const CHAT_MODE_PROMPTS = {
  general: '',
  code:    'CODE MODE — Python code only, with error handling',
  debug:   'DEBUG MODE — trace root cause, show fixed code',
  analyze: 'ANALYZE MODE — step-by-step breakdown then recommendation',
};
```

---

## 🚫 No Mock / Static Data Rules (HOME PAGE)

**Verify**: `search_files(path="nexushome.tsx", pattern="Math.random")` — must return 0 results.

| Component | Real data source |
|-----------|------------------|
| `ThreatHeatmap` | `useMemo` over `recentSessions` fail-rate per 7-day slot |
| `SmartAlertsPanel` | live `metrics` + `recentSessions` |
| `CategoryUsagePanel` | derived from live `metrics.cpu/ram/disk` |
| sparklines | `cpuHistory`/`kbHistory` rolling state arrays |

---

## 🔴 OPEN BUGS (needs fixing — verified 2026-06-20)

| Bug | File | Notes |
|-----|------|-------|
| "Send to Butler AI" + EXPLAIN/IMPROVE/DEBUG buttons not in scripts.tsx | `scripts.tsx` | History says added; 0 search hits — **re-add** |
| UndoCountdownBanner never shows after run | `scripts.tsx` | `undoId`/`undoExpiresSec` not found in file — **re-wire** |
| builder.tsx uses tall NexusPageBanner | `builder.tsx` | Migrate to CompactPageHeader (~130px saved) |
| settings.tsx uses tall NexusPageBanner | `settings.tsx` | Migrate to CompactPageHeader (~130px saved) |
| `extractPythonCode` returns `string\|null` not array | `butlerScripts.ts` | butler.tsx workarounds inline; any other callers will crash |

---

## 🛠️ BUG LOG & FIX HISTORY (2026-06)

| Bug | Fix |
|-----|-----|
| ChatModeBar rendered twice in butler.tsx | Remove from inside ScrollView — keep ONLY in fixed bar |
| Duplicate TabSwipeOverlay in scripts.tsx | Remove second instance |
| `/api/memory` 404 | Replaced with local `knowledgeAccumulator.getStats()` |
| `/api/pc-check/*` 404 | Replaced with `/api/execute` + pcActionScripts.ts |
| `/api/pc_scripts/*` 404 | Removed calls; app uses local embedded library |
| Raw fetch() in logs.tsx bypassing auth | Use `serverConnection.fetchWithAuth(serverConnection.buildUrl(...))` |
| butler.tsx first-load isConnected=false | Seed from `autoConnectEngine.getCurrentConnection()` on mount |
| nexushome.tsx stale state after tab switch | `active` flag + fresh AbortController per tick |
| fileshare.tsx scheduler dead call | Orphaned fetch body removed; /api/scheduler not in v20 |

---

## 🔑 `search_files` gotchas
- `|` (pipe) does NOT work as OR — run separate calls
- After major edits, anchor `old_string` to unique surrounding context lines
- Multi-word patterns with spaces often fail — use a unique sub-string
