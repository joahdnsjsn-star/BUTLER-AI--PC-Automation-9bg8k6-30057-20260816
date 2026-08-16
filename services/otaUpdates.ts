/**
 * otaUpdates — GitHub-backed "welcome any update instantly" engine.
 *
 * Two layers, both optional and both crash-proof:
 *
 *  1) EXPO OTA  — if the build includes `expo-updates` (EAS Update / OnSpace),
 *     we check + fetch + reload the JS bundle live. Loaded through a guarded
 *     dynamic require so the Metro bundler never fails when the package is
 *     absent (same pattern as services/remoteAccessTiers.ts).
 *
 *  2) GITHUB WATCH — polls the public GitHub commits API for the configured
 *     repo/branch. When the newest commit SHA differs from the one we booted
 *     with, we surface an "UPDATE AVAILABLE" banner with the commit subject.
 *     No token, no dependency, works on any Android build.
 *
 * Everything is local-only: the last seen SHA is stored in AsyncStorage.
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const K_REPO = '@butler/ota/repo';
const K_SEEN = '@butler/ota/seen_sha';
const K_BOOT = '@butler/ota/boot_sha';
const K_AUTO = '@butler/ota/auto';

export interface RepoRef { owner: string; repo: string; branch: string }
export interface UpdateInfo {
  available: boolean;
  source: 'expo' | 'github' | 'none';
  sha?: string;
  short?: string;
  message?: string;
  author?: string;
  date?: string;
  checking: boolean;
  applying: boolean;
  error?: string;
  lastCheck: number;
}

const DEFAULT_REPO: RepoRef = { owner: 'andrejsladkovic', repo: 'butler-ai', branch: 'main' };

let state: UpdateInfo = { available: false, source: 'none', checking: false, applying: false, lastCheck: 0 };
const listeners = new Set<(s: UpdateInfo) => void>();
let timer: any = null;
let failures = 0;            // consecutive GitHub failures — drives the backoff
let checkStartedAt = 0;
const STUCK_MS = 45_000;     // a check older than this is treated as abandoned

/** Re-anchor the baseline so an installed/dismissed commit never re-announces. */
async function anchor(sha?: string): Promise<void> {
  if (!sha) return;
  try {
    await AsyncStorage.multiSet([[K_SEEN, sha], [K_BOOT, sha]]);
  } catch {}
}

function emit(patch: Partial<UpdateInfo>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => { try { l(state); } catch {} });
}

/** Guarded loader — never let a missing optional package break the bundle. */
function loadExpoUpdates(): any | null {
  try {
    // eslint-disable-next-line no-eval
    const req = (0, eval)('require');
    const mod = req('expo-updates');
    return mod?.default ?? mod ?? null;
  } catch { return null; }
}

export const otaUpdates = {
  getState(): UpdateInfo { return state; },

  subscribe(fn: (s: UpdateInfo) => void): () => void {
    listeners.add(fn);
    try { fn(state); } catch {}
    return () => { listeners.delete(fn); };
  },

  async getRepo(): Promise<RepoRef> {
    try {
      const raw = await AsyncStorage.getItem(K_REPO);
      if (raw) { const p = JSON.parse(raw); if (p?.owner && p?.repo) return { branch: 'main', ...p }; }
    } catch {}
    return DEFAULT_REPO;
  },

  async setRepo(ref: Partial<RepoRef>): Promise<void> {
    const cur = await otaUpdates.getRepo();
    const next = { ...cur, ...ref };
    const changed = next.owner !== cur.owner || next.repo !== cur.repo || next.branch !== cur.branch;
    try { await AsyncStorage.setItem(K_REPO, JSON.stringify(next)); } catch {}
    if (changed) {
      // The old baseline belongs to a different repo — keeping it would either
      // fire a bogus update banner or hide a real one.
      try { await AsyncStorage.multiRemove([K_SEEN, K_BOOT]); } catch {}
      failures = 0;
      emit({ available: false, source: 'none', sha: undefined, short: undefined, error: undefined });
    }
  },

  async isAuto(): Promise<boolean> {
    try { return (await AsyncStorage.getItem(K_AUTO)) !== '0'; } catch { return true; }
  },
  async setAuto(on: boolean): Promise<void> {
    try { await AsyncStorage.setItem(K_AUTO, on ? '1' : '0'); } catch {}
  },

  /** One check pass: Expo OTA first (authoritative), then GitHub watch. */
  async check(silent = true): Promise<UpdateInfo> {
    // A check that somehow never settled must not wedge the engine forever.
    if (state.checking && Date.now() - checkStartedAt < STUCK_MS) return state;
    checkStartedAt = Date.now();
    emit({ checking: true, error: undefined });

    // ── 1. Expo OTA ────────────────────────────────────────────────
    try {
      const U = loadExpoUpdates();
      if (U?.checkForUpdateAsync) {
        const res = await U.checkForUpdateAsync();
        if (res?.isAvailable) {
          failures = 0;
          emit({
            checking: false, available: true, source: 'expo',
            message: 'New build published — tap to install instantly',
            lastCheck: Date.now(),
          });
          return state;
        }
      }
    } catch { /* not an OTA-enabled build — fall through */ }

    // ── 2. GitHub commit watch ─────────────────────────────────────
    const ctrl = new AbortController();
    const kill = setTimeout(() => { try { ctrl.abort(); } catch {} }, 9000);
    try {
      const { owner, repo, branch } = await otaUpdates.getRepo();
      if (!owner || !repo) throw new Error('no repo configured');

      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
        { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const arr = await res.json();
      const c = Array.isArray(arr) ? arr[0] : null;
      if (!c?.sha) throw new Error('no commits');

      // Anchor the baseline on the FIRST successful check of this install /
      // this repo. `apply()` and `dismiss()` re-anchor it, so a shipped update
      // can never be re-announced and a genuinely new commit is never missed.
      let boot = await AsyncStorage.getItem(K_BOOT);
      if (!boot) { boot = c.sha; try { await AsyncStorage.setItem(K_BOOT, c.sha); } catch {} }
      const seen = await AsyncStorage.getItem(K_SEEN);

      failures = 0;
      const fresh = c.sha !== boot && c.sha !== seen;
      emit({
        checking: false,
        available: fresh,
        source: fresh ? 'github' : 'none',
        sha: c.sha,
        short: String(c.sha).slice(0, 7),
        message: (c.commit?.message || '').split('\n')[0].slice(0, 120),
        author: c.commit?.author?.name || c.author?.login || 'unknown',
        date: c.commit?.author?.date,
        lastCheck: Date.now(),
      });
    } catch (e: any) {
      // Offline, rate-limited (403) or a wrong repo (404) must not turn into a
      // tight poll loop — back off exponentially, capped, and reset on success.
      failures = Math.min(failures + 1, 6);
      emit({
        checking: false,
        available: false,
        lastCheck: Date.now(),
        error: silent ? undefined : String(e?.message || e),
      });
    } finally {
      clearTimeout(kill);
    }
    return state;
  },

  /** Apply: reload the OTA bundle, or acknowledge the GitHub commit. */
  async apply(): Promise<boolean> {
    if (state.applying) return false;
    emit({ applying: true });
    try {
      if (state.source === 'expo') {
        const U = loadExpoUpdates();
        if (U?.fetchUpdateAsync && U?.reloadAsync) {
          await U.fetchUpdateAsync();
          await U.reloadAsync();
          return true;
        }
        // OTA is not actually available in this build — do not silently claim
        // success, and do not fall through to the GitHub acknowledgement path.
        emit({ applying: false, error: 'Live updates are not enabled in this build' });
        return false;
      }
      await anchor(state.sha);
      emit({ applying: false, available: false, source: 'none' });
      return true;
    } catch (e: any) {
      emit({ applying: false, error: String(e?.message || e) });
      return false;
    }
  },

  /** Dismiss without installing — remembers the SHA so it stays quiet. */
  async dismiss(): Promise<void> {
    await anchor(state.sha);
    emit({ available: false, source: 'none' });
  },

  /** Called once from the root layout. Idle-safe, never blocks startup. */
  start(intervalMs = 15 * 60 * 1000): () => void {
    if (timer) return () => {};
    let stopped = false;

    const schedule = (ms: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (stopped) return;
      try {
        if (await otaUpdates.isAuto()) await otaUpdates.check(true);
      } catch {}
      // Exponential backoff while the API keeps failing (max ~16x interval).
      schedule(intervalMs * Math.pow(2, Math.min(failures, 4)));
    };

    timer = setTimeout(tick, 6000);           // after first paint
    return () => {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    };
  },
};

export default otaUpdates;
