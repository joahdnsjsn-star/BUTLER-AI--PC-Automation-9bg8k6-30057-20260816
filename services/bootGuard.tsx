/**
 * Butler AI — Boot Guard · ONE-FILE BLACK-SCREEN PROTECTION
 * ──────────────────────────────────────────────────────────────────
 *
 * Single, simple defensive layer that prevents the entire class of
 * Android cold-start crashes. Replaces three previous files:
 *   • safeDimensionsShim.ts  → `patchDimensions()`
 *   • bootCrashLogger.ts     → `installCrashCapture()` + `readLastCrash()`
 *   • splashController.ts    → `hideSplash()` + `useSplashHide()`
 *
 * Import once at the top of `app/_layout.tsx`:
 *
 *     import { installBootGuard, BootErrorBoundary, useSplashHide,
 *              readLastCrash, markBootSurvived } from '@/services/bootGuard';
 *     installBootGuard();
 *
 * That's it. No other wiring needed.
 */

import React, { Component, ReactNode } from 'react';
import { Dimensions, Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useEffect, useLayoutEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── INSTALL ──────────────────────────────────────────────────────
let _installed = false;

/** Call ONCE at the top of `_layout.tsx`. Safe to call repeatedly. */
export function installBootGuard(): void {
  if (_installed) return;
  _installed = true;
  patchDimensions();
  installCrashCapture();
  // Keep the native splash up until React mounts.
  try { SplashScreen.preventAutoHideAsync().catch(() => {}); } catch {}
  // Absolute failsafe: the tab layout normally hides the splash, but a deep
  // link into a non-tab route (crash-report, legal pages) or an early render
  // fault would otherwise leave the native splash on screen forever.
  armSplashFailsafe();
}

/** Hard backstop — hides the splash no matter which route mounted. */
export function armSplashFailsafe(ms = 6000): void {
  try { setTimeout(() => hideSplash(), ms); } catch {}
}

// ── 1. DIMENSIONS SHIM ───────────────────────────────────────────
// Some Android devices return { width: 0, height: 0 } before the JS
// bridge is fully alive. Files that read Dimensions at module-load
// then divide by zero / produce NaN / crash native rendering.
// We patch ONCE so every later call sees safe fallback values.
function patchDimensions(): void {
  try {
    const FALLBACK = { width: 414, height: 896, scale: 2, fontScale: 1 };
    const original = Dimensions.get.bind(Dimensions);
    (Dimensions as any).get = (dim: 'window' | 'screen') => {
      let v: any;
      try { v = original(dim); } catch { v = null; }
      return {
        width:     v && v.width  > 0 ? v.width     : FALLBACK.width,
        height:    v && v.height > 0 ? v.height    : FALLBACK.height,
        scale:     v && v.scale  > 0 ? v.scale     : FALLBACK.scale,
        fontScale: v && v.fontScale > 0 ? v.fontScale : FALLBACK.fontScale,
      };
    };
  } catch { /* never throw at install */ }
}

// ── 2. CRASH CAPTURE ─────────────────────────────────────────────
const LAST_CRASH_KEY = '@butler_last_crash_v2';

interface StoredCrash { at: number; message: string; stack?: string; }

function installCrashCapture(): void {
  try {
    const EU: any = (globalThis as any).ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const original = EU.getGlobalHandler?.() ?? null;
    EU.setGlobalHandler((err: Error, isFatal?: boolean) => {
      try {
        AsyncStorage.setItem(LAST_CRASH_KEY, JSON.stringify({
          at:      Date.now(),
          message: String(err?.message ?? err ?? 'Unknown'),
          stack:   typeof err?.stack === 'string' ? err.stack.slice(0, 4000) : undefined,
        } as StoredCrash)).catch(() => {});
      } catch {}
      try { original?.(err, isFatal); } catch {}
    });
  } catch {}
}

/** Read the previous-launch crash (if any) and clear it. */
export async function readLastCrash(): Promise<StoredCrash | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CRASH_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(LAST_CRASH_KEY);
    return JSON.parse(raw) as StoredCrash;
  } catch { return null; }
}

/** Mark this boot as successful — clears any stored crash. */
export async function markBootSurvived(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_CRASH_KEY); } catch {}
}

// ── 3. SPLASH HIDE ───────────────────────────────────────────────
let _splashHidden = false;
/** Idempotent splash dismissal — safe to call from anywhere, any number of times. */
export function forceHideSplash(): void { hideSplash(); }
function hideSplash(): void {
  if (_splashHidden) return;
  _splashHidden = true;
  try { SplashScreen.hideAsync().catch(() => {}); } catch {}
}

/**
 * Hide the native splash with TWO strategies:
 *   1. Immediate (useLayoutEffect — runs synchronously after commit).
 *   2. Hard-cap timer (1.5 s — fires no matter what).
 * Idempotent: calling hideSplash() twice is a no-op.
 */
export function useSplashHide(hardCapMs = 1500): void {
  useLayoutEffect(() => {
    hideSplash();
    const t = setTimeout(hideSplash, hardCapMs);
    return () => clearTimeout(t);
  }, [hardCapMs]);
}

// ── 4. ERROR BOUNDARY ────────────────────────────────────────────
interface EBState { error: Error | null; }

export class BootErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState { return { error }; }

  componentDidCatch(error: Error) {
    // Without this the fallback UI renders *behind* the native splash and the
    // user sees a frozen splash instead of the recovery screen.
    try { hideSplash(); } catch {}
    try {
      AsyncStorage.setItem(LAST_CRASH_KEY, JSON.stringify({
        at:      Date.now(),
        message: String(error?.message ?? 'Render error'),
        stack:   typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : undefined,
      } as StoredCrash)).catch(() => {});
    } catch {}
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashFallback message={this.state.error.message} onReset={this.reset} />;
  }
}

function CrashFallback({ message, onReset }: { message: string; onReset: () => void }) {
  const [clearing, setClearing] = React.useState(false);

  const clearAndReset = async () => {
    setClearing(true);
    try {
      const AS = require('@react-native-async-storage/async-storage').default;
      await AS.clear().catch(() => {});
    } catch {}
    setClearing(false);
    onReset();
  };

  return (
    <View style={fallbackStyles.root}>
      <Text style={fallbackStyles.title}>SYSTEM FAULT</Text>
      <View style={fallbackStyles.box}>
        <Text style={fallbackStyles.msg} numberOfLines={8}>{message}</Text>
      </View>
      <TouchableOpacity onPress={onReset} style={fallbackStyles.btn} activeOpacity={0.7}>
        <Text style={fallbackStyles.btnTxt}>REINITIALIZE</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={clearAndReset}
        style={[fallbackStyles.btn, fallbackStyles.clearBtn]}
        activeOpacity={0.7}
        disabled={clearing}
      >
        <Text style={[fallbackStyles.btnTxt, fallbackStyles.clearBtnTxt]}>
          {clearing ? 'CLEARING...' : 'CLEAR DATA & RESTART'}
        </Text>
      </TouchableOpacity>
      <Text style={fallbackStyles.clearHint}>Resets all local data. Use if app is stuck on first install.</Text>
    </View>
  );
}

const MONO: any = Platform.OS === 'ios' ? 'Courier' : 'monospace';

const fallbackStyles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 28 },
  title:      { fontSize: 22, fontWeight: '900', color: '#FF4D5E', letterSpacing: 4, fontFamily: MONO, marginBottom: 22 },
  box:        { width: '100%', maxWidth: 360, borderWidth: 1, borderRadius: 10, borderColor: '#ef444444', backgroundColor: '#ef44440a', padding: 14, marginBottom: 22 },
  msg:        { fontSize: 12, color: '#FF4D5E', lineHeight: 19 },
  btn:        { borderWidth: 1.5, borderColor: '#FF4D5E', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: '#ef444415', marginBottom: 10 },
  btnTxt:     { fontSize: 13, fontWeight: '900', color: '#FF4D5E', letterSpacing: 2, fontFamily: MONO },
  clearBtn:   { borderColor: '#FF7A1F', backgroundColor: '#f9731615' },
  clearBtnTxt:{ color: '#FF7A1F' },
  clearHint:  { fontSize: 10, color: '#555', fontFamily: MONO, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
});

// ── 5. CRASH BANNER (previous-launch crash recovery UI) ──────────
export function PreviousCrashBanner() {
  const [crash, setCrash] = useState<StoredCrash | null>(null);

  useEffect(() => {
    readLastCrash().then(c => { if (c?.message) setCrash(c); }).catch(() => {});
    // Mark "boot survived" after 3 s of staying alive.
    const t = setTimeout(() => { markBootSurvived().catch(() => {}); }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!crash) return null;

  return (
    <View pointerEvents="box-none" style={bannerStyles.wrap}>
      <View style={bannerStyles.card}>
        <Text style={bannerStyles.title}>PREVIOUS LAUNCH CRASHED</Text>
        <Text style={bannerStyles.msg} numberOfLines={6}>{crash.message}</Text>
        <TouchableOpacity
          onPress={() => setCrash(null)}
          style={bannerStyles.btn}
          activeOpacity={0.7}
        >
          <Text style={bannerStyles.btnTxt}>DISMISS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap:  { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, paddingTop: Platform.OS === 'ios' ? 48 : 24, zIndex: 9999 },
  card:  { backgroundColor: '#070A10', borderWidth: 1.5, borderColor: '#FF4D5E', borderRadius: 10, padding: 14 },
  title: { fontSize: 12, fontWeight: '900', color: '#FF4D5E', letterSpacing: 2, marginBottom: 8, fontFamily: MONO },
  msg:   { fontSize: 13, color: '#FF4D5E', lineHeight: 18, marginBottom: 10 },
  btn:   { alignSelf: 'flex-end', borderWidth: 1, borderColor: '#FF4D5E', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  btnTxt:{ fontSize: 11, fontWeight: '900', color: '#FF4D5E', letterSpacing: 1.5, fontFamily: MONO },
});
