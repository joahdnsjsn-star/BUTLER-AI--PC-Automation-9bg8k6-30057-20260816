# GitHub Automation Prompt — Butler AI (OnSpace.ai / Expo React Native)

Paste the block below into **GitHub Copilot Chat**, **Copilot coding agent**
("Assign to Copilot" on an issue), **Cursor**, or any GitHub-connected agent.
It carries the whole project contract, so the agent does not have to rediscover
it — that is the point: the work happens on GitHub's dime instead of ours, and
the agent cannot break the OnSpace build because the rules are stated up front.

A shortened permanent copy lives at `.github/copilot-instructions.md`, which
Copilot loads automatically for every request in this repo.

---

## The prompt

```text
You are working on Butler AI · PC Automation — a pure Expo React Native app
(expo-router) that syncs from GitHub into OnSpace.ai and ships to Android.

NON-NEGOTIABLE RULES
1. Expo React Native only. No web stack. Never add react-dom, vite, next,
   webpack, tailwind, or any DOM API (window, document, localStorage).
   Use AsyncStorage, StyleSheet and React Native primitives.
2. Do not add new npm dependencies. Build features from what is already in
   package.json. If something truly cannot be done without a package, say so
   instead of installing it.
3. Never modify: package.json "main" (must stay "expo-router/entry"),
   metro.config.js (must stay vanilla getDefaultConfig), babel.config.js,
   app.json structure, or the android package id com.butlerai.pc.automation.
4. Never recreate these — they caused "bad application bundle:
   AppRegistry.runApplication()" crashes and were deleted on purpose:
   stubs/, react-native.config.js, index.js, tools/postinstall.js,
   custom metro serializers, transformer overrides or blockLists.
5. Never hard-require an optional package. Use the guarded loader pattern in
   services/remoteAccessTiers.ts.
6. Theme: dark space-slate base #070A10, amber-orange primary #FF7A1F,
   mint #2FE38A, cyan #38D9E8, blue #4A9EFF. Colours come from the active skin
   via hooks/useSkin.ts — never hardcode a hex in a component when a skin token
   exists. Headers use components/ui/SkinHeaderFX.tsx.
7. Layout rule: no large blank space. Centre content, fill gaps, and keep the
   AskBar + QuickButlerBar toolbar present on content screens.
8. Prefer copying existing code from this repo over writing new code.

BEFORE OPENING A PULL REQUEST, ALL OF THESE MUST PASS
  npm run typecheck
  npm run validate:android      # preflight invariants + tsc + expo export
  npm run smoke:android:full    # emulator launch test (or let CI run it)

If you cannot run the emulator locally, push the branch and let
.github/workflows/android-smoke-test.yml prove it. Do not merge red.

DEFINITION OF DONE
- every touched file parses and typechecks
- validate-android preflight reports 0 errors
- the emulator smoke test reaches BUTLER_SMOKE:READY
- no new dependency, no web file, no config drift
- a short summary of what changed and why, in the PR body

TASK:
<describe the task here>
```

---

## Ready-made task lines

Drop one of these into the `TASK:` slot:

- `Add a new tab screen "<name>" under app/(tabs)/ styled exactly like app/(tabs)/logs.tsx — same header pattern using useSkin + SkinHeaderFX, same AskBar and QuickButlerBar, same density. Register it in app/(tabs)/_layout.tsx.`
- `Audit every file under app/ for hardcoded hex colours and replace them with the matching useSkin() token. Do not change layout or spacing.`
- `Find any screen with more than 120px of vertical dead space at the bottom on a 640dp-tall device and fill it with a compact stat grid matching the existing tile style.`
- `Widen the smoke test: after BUTLER_SMOKE:READY, tap each tab via adb input and assert no BUTLER_SMOKE:ERROR appears. Extend scripts/android-smoke-test.mjs only — no new dependency.`
- `Review the last commit for anything that would break the OnSpace.ai sync and open a PR that fixes it.`

## Free automation already wired in this repo

| Workflow                            | Trigger        | Cost to us |
| ----------------------------------- | -------------- | ---------- |
| `android-build-validation.yml`       | push / PR      | GitHub minutes |
| `android-smoke-test.yml`             | push / PR      | GitHub minutes |
| Copilot coding agent on an issue     | you assign it  | GitHub plan |
| Dependabot (if enabled in settings)  | weekly         | free |

Anything one of those can do, do not ask Lovable to do. Open a GitHub issue,
assign it to Copilot with the prompt above, and review the PR.

## Suggested issue template usage

Title: `[agent] <one line>`
Body: paste the prompt block, fill in `TASK:`, then assign to Copilot.
The failing CI log plus `artifacts/android-smoke/first-route.png` gives the
agent everything it needs to iterate without another round trip.
