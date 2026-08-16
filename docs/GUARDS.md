# Butler AI — Guard System

Two layers keep the app from rotting: a **runtime sentinel** that heals the
live app, and a **static scanner** that fails the build on dead or broken code.
Android React Native / Expo only — no web APIs anywhere in either layer.

---

## 1. Runtime — `services/sentinel.ts`

Installed once from `app/_layout.tsx`, before the first render.

| Guard | What it stops | Behaviour |
| --- | --- | --- |
| Error trap | Global JS errors, red boxes | Non-fatal and benign errors are swallowed; fatal ones still bubble unless already looping |
| Console trap | `console.error` spam | Same message repeatedly → key is muted for the session |
| Loop breaker | Runaway render/error loops | 8 identical errors in 4 s → permanently muted + motion downgraded |
| Freeze medic | Frozen / janky UI | JS-thread stall > 1.4 s → motion tier drops to `REDUCED`, second stall → `MINIMAL`; auto-restores after 20 s of smooth frames |
| Quarantine | Visuals that keep crashing | 3 crashes of the same `<Guard name>` → written to disk and **never mounted again**, on this and every future launch |
| Rejection net | Silent async failures | Unhandled promise rejections recorded as incidents |

Motion tiers: `FULL` → `REDUCED` → `MINIMAL`. Decorative loops read the tier
through `useFx()` and stand down automatically.

### API

```ts
import { sentinel } from '@/services/sentinel';

sentinel.motionTier();          // 'FULL' | 'REDUCED' | 'MINIMAL'
sentinel.animationsAllowed();   // boolean
sentinel.incidentList();        // recent incidents, newest first
sentinel.bannedList();          // permanently removed visuals
sentinel.restoreVisual(name);   // bring one back
sentinel.resetAll();            // wipe every guard record

sentinel.safe('scope', () => risky(), fallback);            // never throws
await sentinel.safeAsync('scope', () => risky(), fallback);  // async twin
```

## 2. Containment — `components/ui/Guard.tsx`

```tsx
import { Guard, withGuard, useFx } from '@/components/ui/Guard';

<Guard name="home.headerFX">
  <SkinHeaderFX … />
</Guard>
```

- Crash → the widget renders **nothing** instead of white-screening the tab.
- One automatic retry after 900 ms (covers animation-driver races).
- Repeated crashes → sentinel bans the name permanently.
- `withGuard('id', Component)` wraps a component once for reuse.
- `useFx()` returns `false` while the thread is struggling — gate every
  `Animated.loop` on it.

Currently guarded: `ui.quickAskBar`, `home.headerFX`, plus every tab through
`TabErrorBoundary` (which reports into the sentinel as `tab:<name>`).

## 3. Static — `scripts/guard-scan.mjs`

Runs on `npm run guard:scan`, and automatically before `validate:android`.

Fails the build on:
1. **Broken imports** — path typos, wrong case, deleted modules.
2. **Web API leaks** — `document.*`, `window.*`, `localStorage`, `react-dom`,
   `react-router`, `className=`. Files that intentionally emit an HTML string
   opt out with the comment marker `guard-scan:allow-html-string`.
3. **Unregistered tab screens** — a file in `app/(tabs)` with no
   `<Tabs.Screen name="…">` entry.

Warns on:
4. **Dead files** — modules nothing imports.
5. **Duplicate theme modules** — one palette source of truth (`constants/theme.ts`).

## 4. Dead-code purge (this pass)

122 unreferenced modules were permanently deleted — orphaned components,
superseded services, and three duplicate palettes (`constants/Colors.ts`,
`constants/designTokens.ts`, `constants/typography.ts`) that competed with
`constants/theme.ts`. Removal was iterative: delete → rescan → delete
cascade, until the graph reported zero orphans and zero broken imports.
`components/ui/OnboardingHeroStep.tsx`, `services/qrParser.ts` and
`services/butlerScripts.ts` were restored after the scan proved they were
still wired.

## 5. Continuation list (not done yet)

Safe, incremental follow-ups — none of them block the current build:

- [ ] Wrap the remaining decorative layers in `<Guard>`: `NexusFX`,
      `TabSwipeOverlay`, `ScanlineOverlay`, mascot/companion overlays.
- [ ] Gate every remaining `Animated.loop` on `useFx()` (grep
      `Animated.loop` — headers are done, cards/banners are not).
- [ ] Add a **Guard Report** section in Settings → live incident list,
      quarantined visuals, and one-tap `restoreVisual` / `resetAll`.
- [ ] Surface `motionTier` in the logs tab next to FPS.
- [ ] Extend `guard-scan` with an unused-export check (exported symbols no
      module imports) once the dead-file count stays at zero for a release.
- [ ] Add `guard:scan` as a required step in the smoke-test workflow, not
      just `validate:android`.
