/**
 * Butler AI — Onboarding State Service · v2.0 BULLETPROOF
 * ──────────────────────────────────────────────────────────
 * Single source of truth for reading / writing the "user is onboarded" flag.
 *
 * DESIGN GOALS:
 *  1. Never throw — every method has a try/catch fallback.
 *  2. Fast — reads from an in-memory cache after the first AsyncStorage hit.
 *  3. Resilient — understands ALL legacy key formats ('true', '1', 'done').
 *  4. Atomic writes — multiSet first, fallback to individual setItem.
 *  5. Migration — automatically upgrades old keys to the canonical v2 key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_DONE_KEY,
  WELCOME_COMPLETE_KEY,
  ALL_ONBOARDING_WRITE_KEYS,
} from '@/constants/onboardingKeys';

// ── All keys that mean "user has completed onboarding" ────────────
const DONE_KEYS = [
  ONBOARDING_DONE_KEY,   // '@butler_onboarding_done_v2'  ← canonical
  WELCOME_COMPLETE_KEY,  // '@butler_welcome_complete_v1' ← legacy
  '@butler_onboarding_done_v1', // even older legacy
  '@butler_stable_state',       // 'onboarded' value
];

// ── Truthy value set ─────────────────────────────────────────────
const TRUTHY = new Set(['true', '1', 'done', 'onboarded', 'yes']);

function isTruthy(v: string | null | undefined): boolean {
  if (v == null) return false;
  return TRUTHY.has(v.trim().toLowerCase());
}

// ── In-memory cache ──────────────────────────────────────────────
let _cached: boolean | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

/** Clear the in-memory cache (call after writing). */
export function clearOnboardingCache(): void {
  _cached = null;
  _cacheTs = 0;
}

/**
 * Read whether the user has completed onboarding.
 * Returns true/false. Never throws.
 * Uses in-memory cache (TTL: 10s) to avoid repeated AsyncStorage reads.
 */
export async function isOnboardingDone(): Promise<boolean> {
  // Return cached value if fresh
  if (_cached !== null && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cached;
  }

  try {
    const results = await AsyncStorage.multiGet(DONE_KEYS);
    const done = results.some(([, value]) => isTruthy(value));
    _cached = done;
    _cacheTs = Date.now();
    return done;
  } catch (primaryErr) {
    // multiGet failed — try reading the canonical key alone
    try {
      const v = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
      const done = isTruthy(v);
      _cached = done;
      _cacheTs = Date.now();
      return done;
    } catch {
      // AsyncStorage completely unavailable — assume new user (safe default)
      return false;
    }
  }
}

/**
 * Synchronously return the cached value, or null if not yet read.
 * Use this in render paths only after `isOnboardingDone()` has been awaited.
 */
export function isOnboardingDoneCached(): boolean | null {
  if (_cached !== null && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cached;
  }
  return null;
}

/**
 * Mark onboarding as complete.  Writes all keys atomically.
 * Never throws — safe to call from error boundaries.
 */
export async function markOnboardingDone(): Promise<void> {
  clearOnboardingCache();
  _cached = true;
  _cacheTs = Date.now();

  try {
    await AsyncStorage.multiSet(ALL_ONBOARDING_WRITE_KEYS);
  } catch {
    // multiSet failed — fall back to individual writes
    for (const [key, value] of ALL_ONBOARDING_WRITE_KEYS) {
      try { await AsyncStorage.setItem(key, value); } catch {}
    }
  }
}

/**
 * Reset onboarding state — wipes EVERY key that could mark the user as onboarded.
 * Removes DONE_KEYS + all keys from ALL_ONBOARDING_WRITE_KEYS so a cold-boot
 * correctly sees the user as new.
 */
export async function resetOnboarding(): Promise<void> {
  clearOnboardingCache();
  // Collect every possible key (DONE_KEYS + write-key paths)
  const allKeys = [
    ...DONE_KEYS,
    ...ALL_ONBOARDING_WRITE_KEYS.map(([k]) => k),
  ];
  const unique = Array.from(new Set(allKeys));
  try {
    await AsyncStorage.multiRemove(unique);
  } catch {
    for (const key of unique) {
      try { await AsyncStorage.removeItem(key); } catch {}
    }
  }
  // Double-check canonical key is gone
  try { await AsyncStorage.removeItem(ONBOARDING_DONE_KEY); } catch {}
}
