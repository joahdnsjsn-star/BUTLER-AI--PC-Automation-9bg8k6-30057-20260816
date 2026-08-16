/**
 * services/timerBus.ts — one owner for every background poll.
 *
 * Why this exists:
 *  • Each service used to own a bare setInterval. Nothing paused them when the
 *    app went to the background, so pollers kept firing (battery + fetch spam)
 *    and duplicate start() calls stacked a second timer forever.
 *  • Registering by key makes a repeat start() a no-op replace instead of a leak.
 *  • Everything is auto-paused on 'background' / 'inactive' and resumed on
 *    'active'. Resume fires the tick once immediately so the UI is never stale
 *    for a full period after the user comes back.
 *
 * Pure React Native — AppState only, no web APIs.
 */
import { AppState, type AppStateStatus } from 'react-native';

type Entry = {
  key: string;
  fn: () => void;
  ms: number;
  handle: ReturnType<typeof setInterval> | null;
  runOnResume: boolean;
};

const entries = new Map<string, Entry>();
let active = true;
let wired = false;

function safeRun(e: Entry) {
  try {
    e.fn();
  } catch {
    /* a broken poller must never take the app down */
  }
}

function arm(e: Entry) {
  if (e.handle) return;
  e.handle = setInterval(() => safeRun(e), e.ms);
}

function disarm(e: Entry) {
  if (e.handle) {
    clearInterval(e.handle);
    e.handle = null;
  }
}

function wire() {
  if (wired) return;
  wired = true;
  try {
    AppState.addEventListener('change', (state: AppStateStatus) => {
      const nowActive = state === 'active';
      if (nowActive === active) return;
      active = nowActive;
      entries.forEach((e) => {
        if (active) {
          arm(e);
          if (e.runOnResume) safeRun(e);
        } else {
          disarm(e);
        }
      });
    });
  } catch {}
}

/**
 * Register (or replace) a background poll.
 * @returns an unsubscribe function — safe to call more than once.
 */
export function everyMs(
  key: string,
  ms: number,
  fn: () => void,
  opts: { runOnResume?: boolean; immediate?: boolean } = {},
): () => void {
  wire();
  clearKey(key);

  const e: Entry = {
    key,
    fn,
    ms: Math.max(250, ms | 0),
    handle: null,
    runOnResume: opts.runOnResume !== false,
  };
  entries.set(key, e);
  if (active) arm(e);
  if (opts.immediate && active) safeRun(e);

  return () => clearKey(key);
}

/** Stop and forget one poll. */
export function clearKey(key: string): void {
  const prev = entries.get(key);
  if (prev) {
    disarm(prev);
    entries.delete(key);
  }
}

/** Stop and forget everything (teardown / tests). */
export function clearAll(): void {
  entries.forEach(disarm);
  entries.clear();
}

/** True while the app is foregrounded — pollers can use this as a guard too. */
export function isForeground(): boolean {
  return active;
}

/** Debug helper for the Logs screen. */
export function timerStats(): { key: string; ms: number; running: boolean }[] {
  return [...entries.values()].map((e) => ({ key: e.key, ms: e.ms, running: !!e.handle }));
}

export default { everyMs, clearKey, clearAll, isForeground, timerStats };
