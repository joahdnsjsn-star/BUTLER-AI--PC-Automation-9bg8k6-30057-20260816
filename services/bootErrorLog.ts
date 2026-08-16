/**
 * Butler AI — services/bootErrorLog.ts
 *
 * Persists boot errors to AsyncStorage (capped at 5).
 * Survives JS crashes and app restarts — errors are readable from Settings
 * even after a hard-reload that wipes the in-memory state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BOOT_ERROR_KEY     = '@butler_boot_errors_v1';
const MAX_ENTRIES        = 5;

// ── First-launch key migration constants ─────────────────────────
// v7.2 and earlier used '@nexus_first_launch_v1'.
// v7.3+ uses '@butler_first_launch_v1' (unified in onboardingKeys.ts).
// Migration runs once on boot — moves the old value and deletes the old key.
const OLD_FIRST_LAUNCH_KEY = '@nexus_first_launch_v1';
const NEW_FIRST_LAUNCH_KEY = '@butler_first_launch_v1';

export interface BootErrorEntry {
  /** ISO timestamp */
  ts:      string;
  /** Unix ms */
  tsMs:    number;
  /** Short error message (≤ 300 chars) */
  message: string;
  /** Stack trace snippet (≤ 600 chars) */
  stack?:  string;
  /** Platform string e.g. "android 13 (API 33)" */
  platform: string;
  /** Boot phase where error occurred */
  phase:   'init' | 'storage' | 'routing' | 'service' | 'unknown';
  /** App version from Constants or 'unknown' */
  appVersion: string;
}

// ─── Internal helpers ────────────────────────────────────────────

function buildPlatformString(): string {
  try {
    const os      = Platform.OS;
    const version = String(Platform.Version);
    return `${os} ${version}`;
  } catch {
    return 'unknown';
  }
}

function detectPhase(msg: string): BootErrorEntry['phase'] {
  const m = msg.toLowerCase();
  if (m.includes('storage') || m.includes('asyncstorage'))    return 'storage';
  if (m.includes('router') || m.includes('navigat'))          return 'routing';
  if (m.includes('service') || m.includes('engine') || m.includes('connect')) return 'service';
  return 'unknown';
}

async function readAll(): Promise<BootErrorEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BOOT_ERROR_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BootErrorEntry[];
  } catch {
    return [];
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Append a new boot error.  Oldest entry is dropped when the list exceeds 5.
 */
export async function appendBootError(
  error: Error | string,
  phase: BootErrorEntry['phase'] = 'unknown',
  appVersion = 'unknown',
): Promise<void> {
  try {
    const existing = await readAll();
    const msg   = typeof error === 'string' ? error : (error?.message ?? String(error));
    const stack = typeof error === 'object' && error?.stack ? error.stack.slice(0, 600) : undefined;

    const entry: BootErrorEntry = {
      ts:          new Date().toISOString(),
      tsMs:        Date.now(),
      message:     msg.slice(0, 300),
      stack,
      platform:    buildPlatformString(),
      phase:       phase || detectPhase(msg),
      appVersion,
    };

    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(BOOT_ERROR_KEY, JSON.stringify(updated));
  } catch {
    // Never throw — this is a best-effort logger
  }
}

/**
 * Read all stored boot error entries, newest first.
 */
export async function getBootErrors(): Promise<BootErrorEntry[]> {
  return readAll();
}

/**
 * Clear all stored boot errors.
 */
export async function clearBootErrors(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BOOT_ERROR_KEY);
  } catch {}
}

/**
 * One-shot AsyncStorage key migration: '@nexus_first_launch_v1' → '@butler_first_launch_v1'.
 *
 * Call this as early as possible in _layout.tsx — before the routing
 * decision reads FIRST_LAUNCH_KEY — so users upgrading from older APK
 * builds don't re-see the NexusSplash animation on every cold boot.
 *
 * Safety guarantees:
 *  - Idempotent: if the new key already has a value, does nothing.
 *  - Non-blocking: any AsyncStorage error is silently swallowed.
 *  - Leaves the old key in place until the write of the new key succeeds,
 *    so a partial failure never loses the user's first-launch state.
 *  - Returns 'migrated' | 'already_done' | 'nothing_to_migrate' | 'error'
 *    so callers can log the outcome without crashing.
 */
export async function migrateFirstLaunchKey(): Promise<
  'migrated' | 'already_done' | 'nothing_to_migrate' | 'error'
> {
  try {
    // Fast-path: new key already set — nothing to do
    const newVal = await AsyncStorage.getItem(NEW_FIRST_LAUNCH_KEY);
    if (newVal !== null) return 'already_done';

    // Check whether the old key has data worth migrating
    const oldVal = await AsyncStorage.getItem(OLD_FIRST_LAUNCH_KEY);
    if (oldVal === null) return 'nothing_to_migrate';

    // Write to new key FIRST (safe: read of old key already succeeded)
    await AsyncStorage.setItem(NEW_FIRST_LAUNCH_KEY, oldVal);

    // Remove old key only after the new one is confirmed written
    await AsyncStorage.removeItem(OLD_FIRST_LAUNCH_KEY);

    console.log(
      `[BootMigration] Moved first-launch flag: ${OLD_FIRST_LAUNCH_KEY} → ${NEW_FIRST_LAUNCH_KEY} (value: ${oldVal})`
    );
    return 'migrated';
  } catch (e: any) {
    // Never throw — migration failures must never block boot
    console.warn('[BootMigration] migrateFirstLaunchKey failed:', e?.message ?? e);
    return 'error';
  }
}

/**
 * Returns a human-readable summary string for use in a share / copy sheet.
 */
// ─── Crash Log helpers (used by terminal.tsx BOOT tab) ─────────────────────
// These were previously in app/_layout.tsx which caused a circular import.

const CRASH_LOGS_KEY = '@butler_crash_logs_v1';

export async function getCrashLogs(): Promise<{ ts: number; msg: string; stack: string; platform: string; version: any }[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearCrashLogs(): Promise<void> {
  await AsyncStorage.removeItem(CRASH_LOGS_KEY).catch(() => {});
}

export function recordCrashLog(entry: { ts: number; msg: string; stack: string; platform: string; version: any }): void {
  getCrashLogs().then(logs => {
    const updated = [entry, ...logs].slice(0, 50);
    AsyncStorage.setItem(CRASH_LOGS_KEY, JSON.stringify(updated)).catch(() => {});
  }).catch(() => {});
}

export async function formatBootErrorReport(): Promise<string> {
  const entries = await readAll();
  if (entries.length === 0) return 'No boot errors recorded.';

  const lines: string[] = [
    '=== BUTLER AI BOOT ERROR REPORT ===',
    `Generated: ${new Date().toISOString()}`,
    `Entries: ${entries.length}`,
    '',
  ];

  entries.forEach((e, i) => {
    lines.push(`── Error #${i + 1} ─────────────────────────`);
    lines.push(`Time:     ${e.ts}`);
    lines.push(`Platform: ${e.platform}`);
    lines.push(`Version:  ${e.appVersion}`);
    lines.push(`Phase:    ${e.phase}`);
    lines.push(`Message:  ${e.message}`);
    if (e.stack) {
      lines.push('Stack:');
      lines.push(e.stack);
    }
    lines.push('');
  });

  return lines.join('\n');
}
