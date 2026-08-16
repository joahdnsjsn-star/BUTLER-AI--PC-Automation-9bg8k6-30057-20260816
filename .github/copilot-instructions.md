# Copilot instructions — Butler AI · PC Automation

Expo React Native app (expo-router) that syncs from GitHub into OnSpace.ai and
ships to Android. Read `docs/GITHUB_AUTOMATION_PROMPT.md` for the full contract.

## Hard rules

- **Expo React Native only.** No web stack, no DOM APIs (`window`, `document`,
  `localStorage`). Use `AsyncStorage`, `StyleSheet`, RN primitives.
- **No new npm dependencies.** Build from what is already in `package.json`.
- **Never touch:** `"main": "expo-router/entry"`, `metro.config.js` (must stay
  vanilla `getDefaultConfig`), `babel.config.js`, `app.json` structure, or the
  package id `com.butlerai.pc.automation`.
- **Never recreate** `stubs/`, `react-native.config.js`, `index.js`,
  `tools/postinstall.js`, custom Metro serializers/transformers/blockLists.
  They caused `AppRegistry.runApplication()` boot crashes and were removed.
- **Optional packages** must use the guarded loader pattern from
  `services/remoteAccessTiers.ts` — never a literal `require()`.

## Style

- Colours come from `hooks/useSkin.ts`, not hardcoded hex. Headers use
  `components/ui/SkinHeaderFX.tsx`.
- Palette: base `#070A10`, primary `#FF7A1F`, mint `#2FE38A`, cyan `#38D9E8`,
  blue `#4A9EFF`.
- No large blank space — centre content, keep the AskBar + QuickButlerBar.
- Prefer copying existing patterns in this repo over inventing new ones.

## Definition of done

```bash
npm run typecheck
npm run validate:android
npm run smoke:android:full   # or let CI run android-smoke-test.yml
```

All green, no new dependency, no config drift.
