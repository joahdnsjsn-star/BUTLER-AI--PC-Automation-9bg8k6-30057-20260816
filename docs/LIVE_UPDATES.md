# Live Updates (GitHub → App)

`services/otaUpdates.ts` makes the app welcome any update the moment it lands.

1. **Expo OTA** — if the build ships `expo-updates` (EAS Update / OnSpace publish),
   the app checks, fetches and reloads the new JS bundle live. Loaded through a
   guarded dynamic require, so builds without the package never break.
2. **GitHub watch** — polls `api.github.com/repos/{owner}/{repo}/commits` for the
   configured branch. A newer commit than the booted one raises the
   `GitHubUpdateBanner` on the home dashboard with the commit subject.

Configure at runtime:

```ts
import { otaUpdates } from '@/services/otaUpdates';
await otaUpdates.setRepo({ owner: 'you', repo: 'butler-ai', branch: 'main' });
await otaUpdates.setAuto(true);       // background checks every 15 min
otaUpdates.check(false);              // manual check
```

The watcher starts from `app/_layout.tsx` 6s after first paint and never blocks boot.
