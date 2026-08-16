/**
 * FX ROTATION — keeps the app feeling fresh.
 *
 * A tiny register that advances once per cold start and hands out a stable
 * variant index for the whole session (stable = no flicker, no re-shuffle
 * mid-navigation). Headers, banners and overlays read it to pick a different
 * animation personality each launch.
 *
 * Zero dependencies, zero async work on the render path: the value is chosen
 * synchronously from a launch seed, then persisted in the background so the
 * next launch continues the rotation instead of repeating it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@butler_fx_rotation_v1';
export const FX_VARIANTS = 4;

// Session-stable seed: mixes stored counter (once loaded) with launch time so
// the very first run is never predictable but never changes mid-session.
let sessionVariant = Math.abs(Math.floor(Date.now() / 1000)) % FX_VARIANTS;
let hydrated = false;

/** Load the persisted counter and advance it. Safe to call more than once. */
export async function primeFxRotation(): Promise<number> {
  if (hydrated) return sessionVariant;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    const next = (Number.isFinite(n) ? n + 1 : sessionVariant) % FX_VARIANTS;
    sessionVariant = next;
    AsyncStorage.setItem(KEY, String(next)).catch(() => {});
  } catch {
    /* keep time-seeded fallback */
  }
  return sessionVariant;
}

/** Session-stable variant index, 0..FX_VARIANTS-1. */
export function getFxVariant(): number {
  return sessionVariant;
}

/**
 * Deterministic per-surface variant: two headers on screen never run the exact
 * same loop, but each surface is stable for the session.
 */
export function fxVariantFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h + sessionVariant) % FX_VARIANTS;
}

/** Durations rotate too, so motion cadence differs between launches. */
export function fxDuration(base: number, variant = sessionVariant): number {
  const scale = [1, 1.25, 0.82, 1.1][variant % FX_VARIANTS];
  return Math.round(base * scale);
}

export default { primeFxRotation, getFxVariant, fxVariantFor, fxDuration, FX_VARIANTS };
