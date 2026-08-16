import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { theme } from '@/constants/theme';
import { installBootGuard, BootErrorBoundary } from '@/services/bootGuard';
import { CosmeticProvider } from '@/contexts/CosmeticContext';
import { primeFxRotation } from '@/constants/fxRotation';
import { installSmokeBeacon, smokeMounted } from '@/services/smokeBeacon';
import { installSentinel } from '@/services/sentinel';
import { otaUpdates } from '@/services/otaUpdates';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TabBarProvider } from '@/contexts/TabBarContext';
import { PurchaseProvider } from '@/contexts/PurchaseContext';
import { runtimeErrorMonitor } from '@/services/runtimeErrorMonitor';
import { autoErrorLogger } from '@/services/autoErrorLogger';

// NOTE: Crash log helpers live in services/bootErrorLog.ts.
// Import them directly from there — re-exporting from _layout.tsx risks
// circular module resolution (bootGuard → _layout → bootErrorLog → bootGuard).

// Boot guard: patches Dimensions shim, installs global crash capture,
// and keeps the native splash visible until React mounts.
// Must run before any component renders — module-scope call is intentional.
installBootGuard();

// Emulator smoke-test instrumentation (console markers only, no UI, no
// storage). CI greps these out of `adb logcat`; on a real device they are
// inert log lines. Installed before anything renders so it can catch a
// failure in the very first commit.
installSmokeBeacon();

// Sentinel: self-healing runtime guard. Traps global errors, breaks error
// loops, detects JS-thread freezes and drops motion, and permanently removes
// any visual that keeps crashing. Installed before the first render so a
// fault in the very first commit is contained.
installSentinel();

// Runtime Error Monitor: universal 6-interceptor error capture + auto-fix.
// Installed after sentinel so sentinel's traps run first for critical faults.
// Never throws — all public calls are wrapped.
runtimeErrorMonitor.init().catch(() => {});
autoErrorLogger.info('[Layout]', 'Boot: sentinel + runtimeErrorMonitor installed');

// Advance the animation-variant register once per cold start so headers,
// banners and overlays rotate their motion personality between launches.
// Fire-and-forget: never blocks the boot path.
primeFxRotation().catch(() => {});

// Redundant safety net: if installBootGuard()'s SplashScreen.preventAutoHideAsync()
// call races with a fast Hermes init, this ensures the promise is always registered.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global unhandled promise rejection guard — logs but never crashes the app.
// This catches async errors that escape try/catch blocks (common in service calls).
if (typeof global !== 'undefined') {
  const _origHandler = (global as any).onunhandledrejection;
  (global as any).onunhandledrejection = (event: any) => {
    try {
      const msg = event?.reason?.message ?? String(event?.reason ?? 'unknown');
      // Suppress noisy non-critical errors
      if (!msg.includes('Network request failed') && !msg.includes('AbortError')) {
        require('@/services/autoErrorLogger').autoErrorLogger
          .log('warn', '[UnhandledRejection]', msg.slice(0, 300)).catch?.(() => {});
      }
    } catch {}
    // Always call original handler if it existed
    try { _origHandler?.(event); } catch {}
  };
}

// ── BULLETPROOF STARTUP CRASH HANDLER ─────────────────────────────
// Last-resort safety net for a crash that happens BEFORE the app shell mounts:
// it records the fault, unblocks the first-run gate so the next cold boot can
// never be stuck on a black screen, and steers to nexushome.
//
// GUARD RAILS (this used to fire on every non-fatal warning):
//   • only fatal errors qualify
//   • only while the shell has not mounted — after mount the error boundary owns it
//   • only once per session
// Rules: NEVER throws, NEVER blocks rendering, silently no-ops on any error.
let _shellMounted = false;
/** Called from RootLayout's first effect — disarms the pre-mount recovery path. */
function markShellMounted(): void { _shellMounted = true; }

;(function _installStartupCrashGuard() {
  try {
    const EU: any = (global as any).ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const _prev = EU.getGlobalHandler?.() ?? null;
    let _fired = false;

    EU.setGlobalHandler((err: Error, isFatal?: boolean) => {
      const preMountFatal = !!isFatal && !_shellMounted && !_fired;
      if (preMountFatal) _fired = true;

      try {
        const AS = require('@react-native-async-storage/async-storage').default;
        // The crash record is always useful — write it for any error.
        AS.setItem('@butler_last_crash_v2', JSON.stringify({
          at: Date.now(),
          message: String(err?.message ?? err ?? 'startup crash'),
          stack: typeof err?.stack === 'string' ? err.stack.slice(0, 2000) : undefined,
        })).catch(() => {});

        if (preMountFatal) {
          // Only skip the first-run gate when the shell genuinely never came up.
          AS.setItem('butler_onboarding_done', '1').catch(() => {});
          AS.setItem('butler_welcome_complete', '1').catch(() => {});
        }

        // ── AUTO-REPORT: copy a SAFE summary to clipboard (no full stack trace) ──
        // Clipboard can be read by any foreground app — only copy a non-sensitive
        // one-liner (timestamp + first 120 chars of message, no stack, no IPs).
        AS.getItem('@butler_auto_report_crash_v1').then((flag: string | null) => {
          if (flag !== '1') return;
          try {
            const ts  = new Date().toISOString();
            const msg = String(err?.message ?? err ?? 'startup crash').slice(0, 120);
            // Sanitise: strip anything that looks like an IP address or token
            const safeMsg = msg.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
                               .replace(/Bearer\s+\S+/gi, '[TOKEN]');
            const summary = `Butler AI crash at ${ts}: ${safeMsg}`;
            // Use expo-clipboard (always available in Expo) — never require
            // @react-native-clipboard/clipboard which needs manual native linking.
            import('expo-clipboard').then(m => {
              m.setStringAsync(summary).catch(() => {});
            }).catch(() => {});
          } catch (_) {}
        }).catch(() => {});
      } catch {}

      if (preMountFatal) {
        // A frozen native splash would hide every recovery surface.
        try { require('@/services/bootGuard').forceHideSplash?.(); } catch {}
        // Navigate after 800ms — gives the router time to exist.
        try {
          setTimeout(() => {
            try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {
              try { require('expo-router').router.navigate('/(tabs)/nexushome'); } catch {}
            }
          }, 800);
        } catch {}
      }

      // ── Always forward to the previous handler ──
      try { _prev?.(err, isFatal); } catch {}
    });
  } catch {}
})();

// ── AUTO-HEAL: "Element type is invalid: got object" guard ──────────────────
// This crash class happens when a module resolves to {} instead of a function.
// Root causes: stale Metro bundle cache, babel transform error, bad dynamic import.
// Guard: install a global error handler that detects this class and clears cache.
if (typeof global !== 'undefined') {
  const _origErrorHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
  const _autoHealHandler = (error: any, isFatal: boolean) => {
    try {
      const msg = String(error?.message ?? error ?? '');
      const isInvalidElementType =
        msg.includes('Element type is invalid') ||
        msg.includes('got: object') ||
        msg.includes('got: undefined') ||
        msg.includes('is not a function');
      if (isInvalidElementType) {
        // Log for diagnostics
        try {
          require('@/services/autoErrorLogger').autoErrorLogger
            .log('error', '[AutoHeal] Element type crash — clearing caches', msg.slice(0, 200))
            .catch?.(() => {});
        } catch {}
        // Clear AsyncStorage boot error log so it does not loop
        try {
          require('@react-native-async-storage/async-storage').default
            .multiRemove(['@butler_boot_error_log_v1', 'butler_crash_log_v1'])
            .catch?.(() => {});
        } catch {}
      }
    } catch {}
    // Always forward to original handler so Expo/React can show its own UI
    try { _origErrorHandler?.(error, isFatal); } catch {}
  };
  try {
    (global as any).ErrorUtils?.setGlobalHandler?.(_autoHealHandler);
  } catch {}
}



export default function RootLayout() {
  useEffect(() => { markShellMounted(); smokeMounted(); }, []);
  // Welcome any GitHub / OTA update the moment it lands — idle-safe, never blocks boot.
  useEffect(() => otaUpdates.start(), []);

  return (
    <BootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
        <SafeAreaProvider>
          <LanguageProvider>
            <CosmeticProvider>
              <TabBarProvider>
                <PurchaseProvider>
                  <StatusBar style="light" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: theme.bg },
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="crash-report"
                      options={{
                        headerShown: false,
                        animation: 'slide_from_right',
                        contentStyle: { backgroundColor: '#050810' },
                      }}
                    />
                  </Stack>

                </PurchaseProvider>
              </TabBarProvider>
            </CosmeticProvider>
          </LanguageProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </BootErrorBoundary>
  );
}
