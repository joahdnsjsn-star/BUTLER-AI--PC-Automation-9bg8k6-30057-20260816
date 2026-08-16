/**
 * PERFORMANCE TUNER — Butler AI
 * Detects device capability tier and exports safe animation/fetch configs.
 * Low-end phones get shorter durations, fewer concurrent operations, lazy renders.
 * Zero external deps — pure React Native APIs only.
 */

import { Platform, InteractionManager } from 'react-native';

// ─── DEVICE TIER DETECTION ────────────────────────────────────────
type DeviceTier = 'low' | 'mid' | 'high';

function detectTier(): DeviceTier {
  if (Platform.OS === 'web') return 'high';
  // Android exposes API level — below 28 (Android 9) = likely older hardware
  if (Platform.OS === 'android') {
    const api = (Platform.Version as number) || 0;
    if (api < 26) return 'low';
    if (api < 31) return 'mid';
    return 'high';
  }
  // iOS — rough detection via major version
  if (Platform.OS === 'ios') {
    const major = parseInt(String(Platform.Version).split('.')[0], 10) || 0;
    if (major < 14) return 'low';
    if (major < 16) return 'mid';
    return 'high';
  }
  return 'mid';
}

const TIER: DeviceTier = detectTier();

// ─── EXPORTED TUNING CONFIG ───────────────────────────────────────
export const perf = {
  tier: TIER,
  isLow:  TIER === 'low',
  isMid:  TIER === 'mid',
  isHigh: TIER === 'high',

  // Animation durations scaled by tier
  anim: {
    fast:   TIER === 'low' ? 80  : TIER === 'mid' ? 120 : 200,
    normal: TIER === 'low' ? 140 : TIER === 'mid' ? 220 : 320,
    slow:   TIER === 'low' ? 220 : TIER === 'mid' ? 380 : 600,
    spring: TIER === 'low'
      ? { tension: 300, friction: 20 }   // snappy, minimal frames
      : TIER === 'mid'
      ? { tension: 200, friction: 14 }
      : { tension: 140, friction: 10 },
  },

  // How many ms to delay heavy work after mount
  lazyDelay: TIER === 'low' ? 1200 : TIER === 'mid' ? 700 : 400,

  // Stagger between concurrent API calls (ms)
  fetchStagger: TIER === 'low' ? 900 : TIER === 'mid' ? 500 : 200,

  // Max simultaneous in-flight requests on home screen
  maxConcurrentFetches: TIER === 'low' ? 1 : TIER === 'mid' ? 2 : 3,

  // Whether to show particle FX
  particles: TIER !== 'low',

  // Whether to animate ring gauges (SVG)
  animateRings: TIER !== 'low',

  // Chart / sparkline complexity
  chartPoints: TIER === 'low' ? 6 : TIER === 'mid' ? 12 : 20,
};

// ─── DEFER HELPER — run work after JS animations settle ─────────
export function afterInteractions(fn: () => void): () => void {
  const handle = InteractionManager.runAfterInteractions(fn);
  return () => handle.cancel?.();
}

// ─── STAGGERED FETCH — fires promises one-after-another on low-end
export async function staggeredFetches<T>(
  fetchers: Array<() => Promise<T>>,
  delayMs: number = perf.fetchStagger,
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  for (let i = 0; i < fetchers.length; i++) {
    try {
      const res = await fetchers[i]();
      results.push(res);
    } catch {
      results.push(null);
    }
    if (delayMs > 0 && i < fetchers.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ─── PARALLEL FETCH (high-end) — fires all at once ────────────────
export async function parallelFetches<T>(
  fetchers: Array<() => Promise<T>>,
): Promise<Array<T | null>> {
  const settled = await Promise.allSettled(fetchers.map(f => f()));
  return settled.map(s => (s.status === 'fulfilled' ? s.value : null));
}

// ─── ADAPTIVE FETCH — picks strategy based on tier ───────────────
export async function adaptiveFetches<T>(
  fetchers: Array<() => Promise<T>>,
): Promise<Array<T | null>> {
  if (perf.isLow) return staggeredFetches(fetchers, perf.fetchStagger);
  if (perf.isMid) {
    // Fire in pairs
    const results: Array<T | null> = [];
    for (let i = 0; i < fetchers.length; i += 2) {
      const pair = fetchers.slice(i, i + 2);
      const settled = await Promise.allSettled(pair.map(f => f()));
      settled.forEach(s => results.push(s.status === 'fulfilled' ? s.value : null));
      if (i + 2 < fetchers.length) await new Promise(r => setTimeout(r, 300));
    }
    return results;
  }
  return parallelFetches(fetchers);
}
