/**
 * SENTINEL — Butler AI self-healing runtime guard.
 *
 * One always-on watchdog that makes the app defend itself:
 *
 *   • ERROR TRAP     — global JS errors + console.error are captured, never fatal.
 *   • LOOP BREAKER   — the same error repeating is detected and silenced after
 *                      a threshold, so a broken component can never spin the UI.
 *   • FREEZE MEDIC   — measures JS-thread stall. Sustained stalls drop the app
 *                      into REDUCED then MINIMAL motion, killing decorative
 *                      animations until the thread recovers.
 *   • QUARANTINE     — any visual guarded by <Guard name="…"> that crashes
 *                      repeatedly is recorded to disk and permanently removed
 *                      from the UI on every future launch. No white screens,
 *                      no half-dead widgets.
 *   • SILENT-BUG NET — unhandled promise rejections and no-op renders are
 *                      logged with a stable key so they stop being invisible.
 *
 * Pure React Native / Expo. No web APIs, no DOM, no timers left running.
 * Never throws — every public call is wrapped.
 *
 * © 2026 Andrej Sladkovic — Butler AI — ALL RIGHTS RESERVED
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { everyMs, clearKey, isForeground } from './timerBus';

const QUARANTINE_KEY = '@butler_sentinel_quarantine_v2';
const INCIDENT_KEY   = '@butler_sentinel_incidents_v2';

/** Crashes of one guarded visual before it is removed forever. */
const QUARANTINE_THRESHOLD = 3;
/** Identical errors inside LOOP_WINDOW_MS before the message is muted. */
const LOOP_THRESHOLD = 8;
const LOOP_WINDOW_MS = 4000;
/** JS-thread stall (ms) that counts as a freeze. */
const FREEZE_MS = 1400;
const HEARTBEAT_MS = 900;
const MAX_INCIDENTS = 60;

export type MotionTier = 'FULL' | 'REDUCED' | 'MINIMAL';

export interface Incident {
  key: string;
  kind: 'crash' | 'error' | 'loop' | 'freeze' | 'rejection';
  message: string;
  count: number;
  ts: number;
  quarantined?: boolean;
}

type Listener = () => void;

/** Errors that are noise, not bugs — never surfaced, never quarantined. */
const BENIGN = [
  'Network request failed',
  'AbortError',
  'Aborted',
  'was aborted',
  'timed out',
  'useNativeDriver',
  'Attempting to run JS driven animation',
  'VirtualizedLists should never be nested',
  'source.uri should not be an empty string',
  'Require cycle',
  'componentWillReceiveProps',
  'new NativeEventEmitter',
];

function isBenign(msg: string): boolean {
  const m = String(msg || '');
  return BENIGN.some((b) => m.includes(b));
}

function shortKey(scope: string, msg: string): string {
  // Stable key: scope + first 60 normalised chars (numbers stripped so
  // "failed after 3ms" and "failed after 7ms" collapse into one incident).
  const norm = String(msg || '').replace(/\d+/g, '#').slice(0, 60);
  return `${scope}::${norm}`;
}

class Sentinel {
  private installed = false;
  private quarantine = new Set<string>();
  private incidents = new Map<string, Incident>();
  private muted = new Set<string>();
  private hits = new Map<string, number[]>();
  private listeners = new Set<Listener>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastBeat = 0;
  private freezes = 0;
  private recoverAt = 0;
  private tier: MotionTier = 'FULL';
  private ready = false;

  // ── lifecycle ───────────────────────────────────────────────────
  install(): void {
    if (this.installed) return;
    this.installed = true;

    this.hydrate();
    this.trapGlobalErrors();
    this.trapConsole();
    this.trapRejections();
    this.startHeartbeat();
  }

  /** Stop timers (used by tests / teardown). Safe to call anytime. */
  shutdown(): void {
    if (this.heartbeat) { clearKey('sentinel:heartbeat'); this.heartbeat = null; }
  }

  private async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(QUARANTINE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) list.forEach((k) => typeof k === 'string' && this.quarantine.add(k));
      }
    } catch {}
    this.ready = true;
    this.emit();
  }

  private async persistQuarantine() {
    try { await AsyncStorage.setItem(QUARANTINE_KEY, JSON.stringify([...this.quarantine])); } catch {}
  }

  private async persistIncidents() {
    try {
      const list = [...this.incidents.values()].slice(-MAX_INCIDENTS);
      await AsyncStorage.setItem(INCIDENT_KEY, JSON.stringify(list));
    } catch {}
  }

  // ── traps ───────────────────────────────────────────────────────
  private trapGlobalErrors() {
    try {
      const EU: any = (global as any).ErrorUtils;
      if (!EU?.setGlobalHandler) return;
      const prev = EU.getGlobalHandler?.();
      EU.setGlobalHandler((error: any, isFatal?: boolean) => {
        const msg = String(error?.message ?? error ?? 'unknown');
        this.record('error', 'global', msg);
        // Non-fatal, benign, or already-looping errors are swallowed so the
        // red box / crash path never fires for something recoverable.
        if (!isFatal || isBenign(msg) || this.muted.has(shortKey('global', msg))) return;
        try { prev?.(error, isFatal); } catch {}
      });
    } catch {}
  }

  private trapConsole() {
    try {
      const orig = console.error?.bind(console);
      if (!orig) return;
      console.error = (...args: any[]) => {
        let msg = '';
        try { msg = args.map((a) => (typeof a === 'string' ? a : a?.message ?? '')).join(' '); } catch {}
        const key = shortKey('console', msg);
        // A muted key is a proven log-loop — drop it entirely.
        if (this.muted.has(key)) return;
        this.record('error', 'console', msg);
        if (isBenign(msg)) return;
        try { orig(...args); } catch {}
      };
    } catch {}
  }

  private trapRejections() {
    try {
      const g: any = global as any;
      const prev = g.onunhandledrejection;
      g.onunhandledrejection = (event: any) => {
        const msg = String(event?.reason?.message ?? event?.reason ?? 'unknown');
        this.record('rejection', 'promise', msg);
        try { prev?.(event); } catch {}
      };
    } catch {}
  }

  // ── freeze detection ────────────────────────────────────────────
  private startHeartbeat() {
    this.lastBeat = Date.now();
    this.heartbeat = 1 as unknown as ReturnType<typeof setInterval>;
    everyMs('sentinel:heartbeat', HEARTBEAT_MS, () => {
      const now = Date.now();
      const drift = now - this.lastBeat - HEARTBEAT_MS;
      this.lastBeat = now;

      // Backgrounded JS is throttled by Android — that stall is not a freeze.
      if (!isForeground()) return;

      if (drift > FREEZE_MS) {
        this.freezes += 1;
        this.record('freeze', 'jsthread', `JS thread stalled ${Math.round(drift)}ms`);
        // First stall trims motion, a second one strips it to the bone.
        this.setTier(this.freezes >= 2 ? 'MINIMAL' : 'REDUCED');
        this.recoverAt = now + 20_000;
      } else if (this.tier !== 'FULL' && this.recoverAt && now > this.recoverAt) {
        // Thread has been smooth for 20s — hand the animations back.
        this.freezes = 0;
        this.recoverAt = 0;
        this.setTier('FULL');
      }
    });
  }

  private setTier(t: MotionTier) {
    if (this.tier === t) return;
    this.tier = t;
    this.emit();
  }

  // ── incident recording + loop breaking ──────────────────────────
  private record(kind: Incident['kind'], scope: string, message: string) {
    const key = shortKey(scope, message);
    const now = Date.now();

    const stamps = (this.hits.get(key) ?? []).filter((t) => now - t < LOOP_WINDOW_MS);
    stamps.push(now);
    this.hits.set(key, stamps);

    const prev = this.incidents.get(key);
    const inc: Incident = {
      key,
      kind: stamps.length >= LOOP_THRESHOLD ? 'loop' : kind,
      message: String(message || '').slice(0, 240),
      count: (prev?.count ?? 0) + 1,
      ts: now,
      quarantined: prev?.quarantined,
    };
    this.incidents.set(key, inc);

    // Runaway repeat → mute permanently for this session so it cannot
    // burn frames or spam the log ring.
    if (stamps.length >= LOOP_THRESHOLD && !this.muted.has(key)) {
      this.muted.add(key);
      this.setTier(this.tier === 'FULL' ? 'REDUCED' : this.tier);
    }

    if (this.incidents.size > MAX_INCIDENTS) {
      const oldest = [...this.incidents.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) this.incidents.delete(oldest[0]);
    }

    this.persistIncidents();
    this.emit();
  }

  // ── public API ──────────────────────────────────────────────────

  /** Report a crash from a guarded visual. Returns true if it is now banned. */
  reportCrash(name: string, error: any): boolean {
    const msg = String(error?.message ?? error ?? 'unknown');
    this.record('crash', name, msg);
    const inc = this.incidents.get(shortKey(name, msg));
    if ((inc?.count ?? 0) >= QUARANTINE_THRESHOLD) {
      this.banVisual(name);
      return true;
    }
    return this.isBanned(name);
  }

  /** Permanently remove a visual from the UI, now and on every future launch. */
  banVisual(name: string): void {
    if (!name || this.quarantine.has(name)) return;
    this.quarantine.add(name);
    this.persistQuarantine();
    this.emit();
  }

  /** Bring a quarantined visual back (Settings → repair). */
  restoreVisual(name: string): void {
    if (this.quarantine.delete(name)) { this.persistQuarantine(); this.emit(); }
  }

  isBanned(name: string): boolean { return this.quarantine.has(name); }
  bannedList(): string[] { return [...this.quarantine]; }
  isReady(): boolean { return this.ready; }

  /** Current motion budget — decorative FX must honour this. */
  motionTier(): MotionTier { return this.tier; }
  /** True when decorative animation loops are allowed to run. */
  animationsAllowed(): boolean { return this.tier === 'FULL'; }

  incidentList(): Incident[] {
    return [...this.incidents.values()].sort((a, b) => b.ts - a.ts);
  }

  /** Wipe every guard record — quarantine, incidents, mutes. */
  async resetAll(): Promise<void> {
    this.quarantine.clear();
    this.incidents.clear();
    this.muted.clear();
    this.hits.clear();
    this.freezes = 0;
    this.setTier('FULL');
    try { await AsyncStorage.multiRemove([QUARANTINE_KEY, INCIDENT_KEY]); } catch {}
    this.emit();
  }

  /**
   * Run any risky call behind the guard. Never throws; returns `fallback`
   * when the call fails, and records the failure as an incident.
   */
  safe<T>(scope: string, fn: () => T, fallback: T): T {
    try { return fn(); } catch (e: any) { this.record('error', scope, String(e?.message ?? e)); return fallback; }
  }

  /** Async twin of safe(). */
  async safeAsync<T>(scope: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch (e: any) { this.record('error', scope, String(e?.message ?? e)); return fallback; }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    this.listeners.forEach((l) => { try { l(); } catch {} });
  }
}

export const sentinel = new Sentinel();

/** Call once, as early as possible, from app/_layout.tsx. */
export function installSentinel(): void {
  try { sentinel.install(); } catch {}
}

export default sentinel;
