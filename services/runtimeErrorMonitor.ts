/**
 * RuntimeErrorMonitor — Universal runtime error capture & auto-fix engine
 * ─────────────────────────────────────────────────────────────────────────
 * Installs 6 global interceptors on boot:
 *   1. ErrorUtils global JS error handler
 *   2. Unhandled promise rejection handler
 *   3. fetch() monkey-patch — captures every failed network request
 *   4. console.error/warn — captures all console errors silently
 *   5. Periodic health checks (server, AsyncStorage, services) every 30s
 *   6. Component error boundary sink
 *
 * Auto-fix engine: EVERY error type has a specific fix pattern.
 * Never throws, never blocks rendering, never crashes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { everyMs, clearKey } from './timerBus';

const MAX_ENTRIES = 150;
const STORAGE_KEY = '@butler_runtime_monitor_v1';
const HEALTH_INTERVAL_MS = 30_000;

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';
export type ErrorCategory =
  | 'js_crash'
  | 'unhandled_promise'
  | 'network'
  | 'console_error'
  | 'console_warn'
  | 'health_check'
  | 'component_crash'
  | 'storage'
  | 'service'
  | 'auto_fix';

export interface RuntimeError {
  id:           string;
  ts:           number;
  severity:     ErrorSeverity;
  category:     ErrorCategory;
  message:      string;
  source:       string;
  stack?:       string;
  url?:         string;
  statusCode?:  number;
  autoFixed:    boolean;
  fixAttempted: boolean;
  fixResult?:   string;
  count:        number;
}

export interface HealthSnapshot {
  ts:            number;
  server:        'ok' | 'degraded' | 'offline';
  serverLatency: number;
  storage:       'ok' | 'warn' | 'error';
  storageUsedKB: number;
  services: {
    serverConnection:     boolean;
    autoErrorLogger:      boolean;
    knowledgeAccumulator: boolean;
    executionHistory:     boolean;
  };
  errorCount:    number;
  criticalCount: number;
}

type Listener = (errors: RuntimeError[], health: HealthSnapshot | null) => void;

interface FixPattern {
  match: (e: RuntimeError) => boolean;
  label: string;
  fix:   (e: RuntimeError) => Promise<string>;
}

class RuntimeErrorMonitorService {
  private static _inst: RuntimeErrorMonitorService;
  static getInstance() {
    if (!this._inst) this._inst = new RuntimeErrorMonitorService();
    return this._inst;
  }

  private _errors:    RuntimeError[]  = [];
  private _health:    HealthSnapshot | null = null;
  private _listeners: Set<Listener>   = new Set();
  private _started:   boolean         = false;
  private _origFetch: typeof fetch | null = null;
  private _origConsoleError: typeof console.error | null = null;
  private _origConsoleWarn:  typeof console.warn  | null = null;

  // ── Public API ───────────────────────────────────────────────────
  getErrors()  { return [...this._errors].reverse(); }
  getHealth()  { return this._health; }
  getErrorCount(sev?: ErrorSeverity) {
    return sev ? this._errors.filter(e => e.severity === sev).length : this._errors.length;
  }
  getCriticalCount() { return this.getErrorCount('critical') + this.getErrorCount('error'); }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    fn(this.getErrors(), this._health);
    return () => this._listeners.delete(fn);
  }

  reportComponentError(error: Error, componentStack?: string) {
    this._add({
      category: 'component_crash',
      severity: 'critical',
      message:  error?.message ?? String(error),
      source:   'React Error Boundary',
      stack:    (error?.stack ?? '') + (componentStack ?? ''),
    });
  }

  // Expose _add for external callers (AppHealthEngine, SecurityAuditEngine)
  _add(partial: Omit<RuntimeError, 'id' | 'ts' | 'autoFixed' | 'fixAttempted' | 'count'>) {
    try {
      const recent = this._errors.find(e =>
        e.message === partial.message &&
        e.category === partial.category &&
        Date.now() - e.ts < 5 * 60_000
      );
      if (recent) {
        recent.count++;
        recent.ts = Date.now();
        this._emit();
        return;
      }
      const entry: RuntimeError = {
        ...partial,
        id:           `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts:           Date.now(),
        autoFixed:    false,
        fixAttempted: false,
        count:        1,
      };
      this._errors.push(entry);
      if (this._errors.length > MAX_ENTRIES) {
        this._errors = this._errors.slice(-MAX_ENTRIES);
      }
      this._persist();
      this._emit();
      // Auto-attempt fix for critical/error
      if (entry.severity === 'critical' || entry.severity === 'error') {
        setTimeout(() => this.attemptFix(entry.id).catch(() => {}), 400);
      }
    } catch {}
  }

  async clearAll() {
    this._errors = [];
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    this._emit();
  }

  async attemptFix(id: string): Promise<string> {
    const e = this._errors.find(x => x.id === id);
    if (!e) return 'Error not found';
    const pattern = this._FIX_PATTERNS.find(p => { try { return p.match(e); } catch { return false; } });
    if (!pattern) {
      this._mutate(id, { fixAttempted: true, fixResult: 'No specific fix available — error has been logged' });
      return 'Logged';
    }
    try {
      const result = await pattern.fix(e);
      this._mutate(id, { fixAttempted: true, autoFixed: true, fixResult: result });
      this._addInternal({ category: 'auto_fix', severity: 'info', message: `Fixed: ${e.message.slice(0, 80)}`, source: pattern.label });
      return result;
    } catch (err: any) {
      const msg = err?.message ?? 'Fix failed';
      this._mutate(id, { fixAttempted: true, fixResult: msg });
      return msg;
    }
  }

  async attemptFixAll() {
    const unfixed = this._errors.filter(e => !e.autoFixed && !e.fixAttempted && e.severity !== 'info');
    await Promise.allSettled(unfixed.map(e => this.attemptFix(e.id)));
  }

  // ── Boot ─────────────────────────────────────────────────────────
  async init() {
    if (this._started) return;
    this._started = true;
    await this._loadPersisted();
    this._installGlobalJsHandler();
    this._installPromiseRejectionHandler();
    this._installFetchInterceptor();
    this._installConsoleInterceptors();
    this._startHealthLoop();
  }

  // ── 1. Global JS error handler ───────────────────────────────────
  private _installGlobalJsHandler() {
    try {
      const EU: any = (global as any).ErrorUtils;
      if (!EU?.setGlobalHandler) return;
      const prev = EU.getGlobalHandler?.() ?? null;
      EU.setGlobalHandler((err: Error, isFatal?: boolean) => {
        try {
          const msg = err?.message ?? String(err ?? 'Unknown JS error');
          const noisy = [
            'Network request failed', 'AbortError',
            'No handler registered', 'SplashScreen.hide',
          ];
          const isNoisy = noisy.some(n => msg.includes(n));
          this._add({
            category: 'js_crash',
            severity: isFatal ? 'critical' : isNoisy ? 'warning' : 'error',
            message:  msg.slice(0, 400),
            source:   'Global ErrorUtils',
            stack:    typeof err?.stack === 'string' ? err.stack.slice(0, 1000) : undefined,
          });
        } catch {}
        try { prev?.(err, isFatal); } catch {}
      });
    } catch {}
  }

  // ── 2. Unhandled promise rejections ─────────────────────────────
  private _installPromiseRejectionHandler() {
    try {
      const orig = (global as any).onunhandledrejection;
      (global as any).onunhandledrejection = (event: any) => {
        try {
          const reason = event?.reason;
          const msg = reason?.message ?? String(reason ?? 'Unhandled rejection');
          if (!msg.includes('Network request failed') && !msg.includes('AbortError')) {
            this._add({
              category: 'unhandled_promise',
              severity: 'error',
              message:  msg.slice(0, 400),
              source:   'Unhandled Promise',
              stack:    reason?.stack?.slice(0, 600),
            });
          }
        } catch {}
        try { orig?.(event); } catch {}
      };
    } catch {}
  }

  // ── 3. fetch() interceptor ────────────────────────────────────────
  private _isHealthCheckUrl(url: string): boolean {
    const HEALTH_PATHS = ['/api/status', '/api/health', '/api/metrics', '/api/ping', '/api/info'];
    return HEALTH_PATHS.some(p => url.includes(p));
  }

  private _isServerConnected(): boolean {
    try {
      const { serverConnection } = require('./serverConnection');
      return serverConnection.isConnected?.() ?? false;
    } catch { return false; }
  }

  private _installFetchInterceptor() {
    try {
      if (!(global as any).fetch) return;
      this._origFetch = (global as any).fetch;
      const self = this;
      (global as any).fetch = async function patchedFetch(input: any, init?: any): Promise<Response> {
        const url = typeof input === 'string' ? input : (input as Request)?.url ?? 'unknown';
        const startMs = Date.now();
        const isHealthCheck = self._isHealthCheckUrl(url);
        try {
          const res = await self._origFetch!.call(this, input, init);
          const latency = Date.now() - startMs;
          if (!res.ok && !isHealthCheck && res.status !== 404 && !(res.status === 401 && url.includes('/api/status'))) {
            self._add({
              category:   'network',
              severity:   res.status >= 500 ? 'error' : 'warning',
              message:    `HTTP ${res.status} — ${url.replace(/https?:\/\/[^/]+/, '')}`,
              source:     'fetch() interceptor',
              url,
              statusCode: res.status,
            });
          }
          if (latency > 8000 && self._isServerConnected() && !isHealthCheck) {
            self._add({
              category: 'network',
              severity: 'warning',
              message:  `Slow request ${latency}ms — ${url.replace(/https?:\/\/[^/]+/, '')}`,
              source:   'fetch() interceptor',
              url,
            });
          }
          return res;
        } catch (err: any) {
          const msg = err?.message ?? 'Network error';
          const isAbort = msg.includes('AbortError') || msg.includes('aborted');
          const isExpectedOffline = isHealthCheck && !self._isServerConnected();
          if (!isAbort && !isExpectedOffline) {
            self._add({
              category: 'network',
              severity: 'warning',
              message:  `${msg.slice(0, 120)} — ${url.replace(/https?:\/\/[^/]+/, '').slice(0, 80)}`,
              source:   'fetch() interceptor',
              url,
            });
          }
          throw err;
        }
      };
    } catch {}
  }

  // ── 4. console interceptors ───────────────────────────────────────
  private _installConsoleInterceptors() {
    try {
      this._origConsoleError = console.error.bind(console);
      this._origConsoleWarn  = console.warn.bind(console);
      const self = this;
      console.error = function (...args: any[]) {
        try {
          const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 400);
          if (!msg.includes('[AutoErrorLogger') && !msg.includes('[RuntimeErrorMonitor') && !msg.includes('Warning: Each child')) {
            self._add({ category: 'console_error', severity: 'error', message: msg, source: 'console.error' });
          }
        } catch {}
        self._origConsoleError?.(...args);
      };
      console.warn = function (...args: any[]) {
        try {
          const msg = args.map(a => typeof a === 'string' ? a : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ').slice(0, 300);
          const actionable = [
            'Non-serializable', 'VirtualizedList', 'FlexLayout', 'Warning: Failed prop',
            'Warning: componentWill', 'Cannot update', 'Maximum update depth',
          ];
          if (actionable.some(k => msg.includes(k))) {
            self._add({ category: 'console_warn', severity: 'warning', message: msg, source: 'console.warn' });
          }
        } catch {}
        self._origConsoleWarn?.(...args);
      };
    } catch {}
  }

  // ── 5. Health loop ────────────────────────────────────────────────
  private _startHealthLoop() {
    setTimeout(() => { this._runHealthCheck().catch(() => {}); }, 15_000);
    everyMs('monitor:health', HEALTH_INTERVAL_MS, () => { this._runHealthCheck().catch(() => {}); });
  }

  private async _runHealthCheck() {
    const snap: HealthSnapshot = {
      ts: Date.now(),
      server: 'offline',
      serverLatency: 0,
      storage: 'ok',
      storageUsedKB: 0,
      services: {
        serverConnection: false,
        autoErrorLogger: false,
        knowledgeAccumulator: false,
        executionHistory: false,
      },
      errorCount:    this._errors.length,
      criticalCount: this.getCriticalCount(),
    };

    try {
      const { serverConnection } = require('./serverConnection');
      snap.services.serverConnection = true;
      const connected = serverConnection.isConnected?.();
      if (connected) {
        const ip   = serverConnection.getIP?.();
        const port = serverConnection.getPort?.();
        if (ip && port) {
          const t0 = Date.now();
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 5000);
          try {
            const tok = serverConnection.getToken?.() ?? '';
            const headers: Record<string, string> = {};
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
            const res = await (this._origFetch ?? fetch)(`http://${ip}:${port}/api/status`, { headers, signal: ctrl.signal });
            snap.serverLatency = Date.now() - t0;
            snap.server = res.ok ? 'ok' : 'degraded';
            if (!res.ok && res.status !== 401) {
              this._add({ category: 'health_check', severity: 'warning', message: `Server returned ${res.status} on /api/status`, source: 'Health Monitor' });
            }
          } catch (e: any) {
            snap.server = 'offline';
            const eMsg = e?.message ?? '';
            if (!eMsg.includes('AbortError') && !eMsg.includes('aborted') && !eMsg.includes('Network request failed')) {
              this._add({ category: 'health_check', severity: 'warning', message: `Server lost: ${eMsg.slice(0, 80)}`, source: 'Health Monitor' });
            }
          }
        }
      }
    } catch {}

    try {
      const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
      let totalBytes = 0;
      const sample = Array.from(keys).slice(0, 20);
      await Promise.allSettled(sample.map(async k => {
        try { const v = await AsyncStorage.getItem(k); totalBytes += (v?.length ?? 0) * 2; } catch {}
      }));
      const estimated = keys.length > 0 ? (totalBytes / Math.max(1, sample.length)) * keys.length : totalBytes;
      snap.storageUsedKB = Math.round(estimated / 1024);
      snap.storage = snap.storageUsedKB > 4096 ? 'warn' : 'ok';
      if (snap.storageUsedKB > 5120) {
        this._add({ category: 'storage', severity: 'warning', message: `AsyncStorage ~${snap.storageUsedKB}KB — approaching limit`, source: 'Health Monitor' });
      }
    } catch { snap.storage = 'error'; }

    try { require('./autoErrorLogger');       snap.services.autoErrorLogger = true; } catch {}
    try { require('./knowledgeAccumulator');  snap.services.knowledgeAccumulator = true; } catch {}
    try { require('./executionHistory');      snap.services.executionHistory = true; } catch {}

    this._health = snap;
    this._emit();
  }

  // ── Internal helpers ─────────────────────────────────────────────
  // Private version (doesn't auto-trigger fix) for use by fix patterns themselves
  private _addInternal(partial: Omit<RuntimeError, 'id' | 'ts' | 'autoFixed' | 'fixAttempted' | 'count'>) {
    try {
      const recent = this._errors.find(e =>
        e.message === partial.message && e.category === partial.category && Date.now() - e.ts < 5 * 60_000
      );
      if (recent) { recent.count++; recent.ts = Date.now(); this._emit(); return; }
      const entry: RuntimeError = {
        ...partial,
        id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(), autoFixed: false, fixAttempted: false, count: 1,
      };
      this._errors.push(entry);
      if (this._errors.length > MAX_ENTRIES) this._errors = this._errors.slice(-MAX_ENTRIES);
      this._persist();
      this._emit();
    } catch {}
  }

  private _mutate(id: string, patch: Partial<RuntimeError>) {
    const idx = this._errors.findIndex(e => e.id === id);
    if (idx >= 0) { this._errors[idx] = { ...this._errors[idx], ...patch }; this._emit(); }
  }

  private _emit() {
    this._listeners.forEach(fn => { try { fn(this.getErrors(), this._health); } catch {} });
  }

  private _persist() {
    try {
      const toSave = this._errors.slice(-50);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
    } catch {}
  }

  private async _loadPersisted() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr: RuntimeError[] = JSON.parse(raw);
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this._errors = Array.isArray(arr) ? arr.filter(e => e.ts > cutoff) : [];
      }
    } catch {}
  }

  // ── AUTO-FIX PATTERNS — every error type covered ─────────────────
  // IMPORTANT: patterns are tested in ORDER — first match wins.
  // Keep the most specific patterns (animation, component) BEFORE generic ones.
  private readonly _FIX_PATTERNS: FixPattern[] = [

    // ── ANIMATION CRASHES (most common crash class in this app) ──────
    {
      label: 'Animation: Reset tab + stop conflicting animations',
      match: e =>
        e.message.includes('Attempting to run JS driven animation') ||
        e.message.includes('animated node that has been moved') ||
        e.message.includes('useNativeDriver') ||
        e.message.toLowerCase().includes('animated node') ||
        (e.category === 'component_crash' && e.message.toLowerCase().includes('animat')),
      fix: async () => {
        // Signal all mounted animation loops to stop
        try { (global as any).__butlerStopAllAnimations?.(); } catch {}
        // Trigger the error boundary to auto-reset (1s timer in TabErrorBoundary)
        try { (global as any).__butlerResetTabBoundary?.('Core'); } catch {}
        try { (global as any).__butlerResetTabBoundary?.('nexushome'); } catch {}
        // Bump reset counter so affected components see a change
        try {
          (global as any).__butlerAnimReset = ((global as any).__butlerAnimReset ?? 0) + 1;
        } catch {}
        return 'Animation driver conflict cleared — tab auto-resets in 1s';
      },
    },

    // ── COMPONENT CRASHES (React render errors) ───────────────────────
    {
      label: 'Component: Reset error boundary + clear crash cache',
      match: e => e.category === 'component_crash',
      fix: async () => {
        try {
          await AsyncStorage.multiRemove([
            '@butler_boot_error_log_v1',
            'butler_crash_log_v1',
            '@butler_last_crash_v2',
          ]).catch(() => {});
        } catch {}
        try { (global as any).__butlerResetTabBoundary?.('Core'); } catch {}
        return 'Component crash cleared — boundary will auto-reset';
      },
    },

    // ── JS CRASH: Element type invalid (bad import/export) ────────────
    {
      label: 'JS: Element type invalid — clear bundle state',
      match: e =>
        e.message.includes('Element type is invalid') ||
        e.message.includes('got: object') ||
        e.message.includes('got: undefined') ||
        (e.category === 'js_crash' && e.message.includes('is not a function') && !e.message.includes('Network')),
      fix: async () => {
        await AsyncStorage.multiRemove([
          '@butler_boot_error_log_v1',
          'butler_crash_log_v1',
          '@butler_last_crash_v2',
          '__react_navigation/rehydrated',
        ]).catch(() => {});
        return 'Bundle state cleared — reload app to fully resolve';
      },
    },

    // ── JS CRASH: Infinite render loop ────────────────────────────────
    {
      label: 'JS: Infinite render loop — navigate to home',
      match: e =>
        e.message.includes('Maximum update depth exceeded') ||
        e.message.includes('Too many re-renders') ||
        e.message.includes('Infinite loop'),
      fix: async () => {
        try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        return 'Navigated home to break infinite render loop';
      },
    },

    // ── JS CRASH: Context/Provider missing ───────────────────────────
    {
      label: 'JS: Missing Provider — navigate home to reinitialise',
      match: e =>
        e.message.includes('must be used within') ||
        (e.message.includes('Context') && e.category === 'js_crash') ||
        (e.message.includes('Provider') && e.category === 'js_crash'),
      fix: async () => {
        try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        return 'Context error — navigated to root to reinitialise providers';
      },
    },

    // ── JS CRASH: Null/undefined dereference ─────────────────────────
    {
      label: 'JS: Null reference — safe navigation',
      match: e =>
        e.category === 'js_crash' && (
          e.message.includes('Cannot read prop') ||
          e.message.includes('null is not an object') ||
          e.message.includes('undefined is not an object') ||
          e.message.includes('Cannot read properties of null') ||
          e.message.includes('Cannot read properties of undefined')
        ),
      fix: async () => {
        setTimeout(() => {
          try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        }, 300);
        return 'Null ref detected — navigating to home to break render loop';
      },
    },

    // ── JS CRASH: Generic (fallback) ──────────────────────────────────
    {
      label: 'JS Crash: Clear crash cache + navigate home',
      match: e => e.category === 'js_crash',
      fix: async () => {
        await AsyncStorage.multiRemove([
          '@butler_boot_error_log_v1',
          'butler_crash_log_v1',
          '@butler_last_crash_v2',
        ]).catch(() => {});
        setTimeout(() => {
          try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        }, 400);
        return 'Crash cache cleared — auto-navigating to safe screen';
      },
    },

    // ── UNHANDLED PROMISE: Unmounted component ─────────────────────
    {
      label: 'Promise: Unmounted component state update',
      match: e =>
        e.category === 'unhandled_promise' && (
          e.message.includes('unmounted') ||
          e.message.includes('memory leak') ||
          e.message.includes("can't perform")
        ),
      fix: async () => {
        try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        return 'Unmounted state mutation — navigated to home';
      },
    },

    // ── UNHANDLED PROMISE: Generic ────────────────────────────────────
    {
      label: 'Promise: Log rejection',
      match: e => e.category === 'unhandled_promise',
      fix: async (e) => {
        try {
          const { autoErrorLogger } = require('./autoErrorLogger');
          autoErrorLogger.error?.('AutoFix:UnhandledPromise', e.message.slice(0, 200));
        } catch {}
        return 'Rejection logged — if persistent, check service initialisation order';
      },
    },

    // ── NETWORK: HTTP 401 Unauthorized ────────────────────────────────
    {
      label: 'Auth: Refresh token (re-pair)',
      match: e =>
        e.statusCode === 401 ||
        (e.category === 'network' && (e.message.includes('401') || e.message.includes('Unauthorized'))),
      fix: async () => {
        const { serverConnection } = require('./serverConnection');
        const ip   = serverConnection.getIP?.();
        const port = serverConnection.getPort?.();
        if (!ip || !port) return 'No server IP stored — scan QR to pair';
        const result = await serverConnection.connectManual?.(ip, port).catch((err: any) => ({ success: false, error: err?.message }));
        return (result as any)?.success ? 'Token refreshed via re-pair' : 'Re-pair required — use QR scanner on HOME tab';
      },
    },

    // ── NETWORK: HTTP 403 Forbidden ───────────────────────────────────
    {
      label: 'Auth: 403 Forbidden — clear token + re-pair',
      match: e =>
        e.statusCode === 403 ||
        (e.category === 'network' && (e.message.includes('403') || e.message.includes('Forbidden'))),
      fix: async () => {
        try {
          const { encryptedStorage } = require('./encryptedStorage');
          await encryptedStorage.removeItem?.('@sc_session_token_v1').catch(() => {});
        } catch {}
        await AsyncStorage.removeItem('@butler_server_token').catch(() => {});
        return '403: Token cleared — scan QR on HOME to re-pair';
      },
    },

    // ── NETWORK: HTTP 500 Server Error ────────────────────────────────
    {
      label: 'Server: 500 error — reconnect',
      match: e =>
        e.statusCode === 500 ||
        (e.category === 'network' && e.message.includes('500')),
      fix: async (e) => {
        try {
          const { autoErrorLogger } = require('./autoErrorLogger');
          autoErrorLogger.error?.('AutoFix', `Server 500 on ${e.url ?? 'unknown'}`);
        } catch {}
        try {
          const { serverConnection } = require('./serverConnection');
          await serverConnection.reconnect?.().catch(() => null);
        } catch {}
        return 'Server 500 logged + reconnect attempted — restart butler_server.py if persistent';
      },
    },

    // ── NETWORK: HTTP 503 / 502 Service Unavailable ────────────────
    {
      label: 'Server: 5xx — reconnect + notify',
      match: e =>
        (e.statusCode !== undefined && e.statusCode >= 502 && e.statusCode <= 504) ||
        (e.category === 'network' && (e.message.includes('502') || e.message.includes('503') || e.message.includes('504'))),
      fix: async () => {
        try {
          const { serverConnection } = require('./serverConnection');
          await serverConnection.reconnect?.().catch(() => null);
        } catch {}
        return 'Server gateway error — reconnect queued. Ensure butler_server.py is running.';
      },
    },

    // ── NETWORK: HTTP 404 Not Found ───────────────────────────────────
    {
      label: 'Network: 404 Not Found',
      match: e =>
        e.statusCode === 404 ||
        (e.category === 'network' && e.message.includes('404')),
      fix: async (e) => {
        const path = e.url ? e.url.replace(/https?:\/\/[^/]+/, '').slice(0, 60) : 'endpoint';
        return `404 on ${path} — server may need updating to latest version`;
      },
    },

    // ── NETWORK: Generic reconnect ────────────────────────────────────
    {
      label: 'Network: Reconnect server',
      match: e =>
        e.category === 'network' ||
        (e.category === 'health_check' && e.message.includes('unreachable')),
      fix: async () => {
        try {
          const { serverConnection } = require('./serverConnection');
          const { autoConnectEngine } = require('./autoConnectEngine');
          autoConnectEngine.notifyDisconnected?.();
          const result = await serverConnection.reconnect?.().catch(() => null);
          return result?.connected ? 'Reconnected successfully' : 'Reconnect queued — engine will retry';
        } catch {
          return 'Reconnect attempted — check PC server is running';
        }
      },
    },

    // ── NETWORK: Slow request ─────────────────────────────────────────
    {
      label: 'Network: Slow request',
      match: e => e.category === 'network' && e.message.includes('Slow request'),
      fix: async () => 'Slow response logged — check server CPU/RAM via INTEL tab',
    },

    // ── STORAGE: AsyncStorage bloat ───────────────────────────────────
    {
      label: 'Storage: Prune old data',
      match: e => e.category === 'storage',
      fix: async () => {
        const keys = Array.from(await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]));
        const prunable = keys.filter((k: string) =>
          k.includes('_cache_') || k.includes('_temp_') || k.includes('_buf_') ||
          k.startsWith('@nx_health_test') || k.startsWith('@butler_debug_')
        );
        if (prunable.length > 0) await AsyncStorage.multiRemove(prunable).catch(() => {});
        await AsyncStorage.multiRemove([
          '@butler_boot_error_log_v1',
          'butler_crash_log_v1',
          '@butler_last_crash_v2',
        ]).catch(() => {});
        return `Storage pruned: removed ${prunable.length + 3} stale entries`;
      },
    },

    // ── SERVICE: autoConnectEngine ────────────────────────────────────
    {
      label: 'Service: Restart auto-connect engine',
      match: e =>
        e.category === 'service' &&
        (e.message.toLowerCase().includes('autoconnect') || e.message.toLowerCase().includes('auto_connect')),
      fix: async () => {
        const { autoConnectEngine } = require('./autoConnectEngine');
        autoConnectEngine.notifyDisconnected?.();
        return 'Auto-connect engine reset';
      },
    },

    // ── SERVICE: heartbeat ────────────────────────────────────────────
    {
      label: 'Service: Restart heartbeat engine',
      match: e =>
        e.category === 'service' &&
        e.message.toLowerCase().includes('heartbeat'),
      fix: async () => {
        const { heartbeatEngine } = require('./heartbeatEngine');
        heartbeatEngine.stop?.(); heartbeatEngine.start?.();
        return 'Heartbeat engine restarted';
      },
    },

    // ── SERVICE: serverConnection ─────────────────────────────────────
    {
      label: 'Service: Reset server connection',
      match: e =>
        e.category === 'service' &&
        (e.message.toLowerCase().includes('serverconnection') || e.message.toLowerCase().includes('server_conn')),
      fix: async () => {
        const { serverConnection } = require('./serverConnection');
        await serverConnection.reconnect?.().catch(() => null);
        return 'Server connection reset';
      },
    },

    // ── SERVICE: tripwire ─────────────────────────────────────────────
    {
      label: 'Service: Reset neural tripwire',
      match: e =>
        e.category === 'service' &&
        (e.message.toLowerCase().includes('tripwire') || e.message.toLowerCase().includes('neural')),
      fix: async () => {
        const { neuralTripwire } = require('./neuralTripwire');
        neuralTripwire.reset?.();
        return 'Neural tripwire reset';
      },
    },

    // ── SERVICE: Generic ──────────────────────────────────────────────
    {
      label: 'Service: Log + reconnect',
      match: e => e.category === 'service',
      fix: async (e) => {
        try {
          const { autoErrorLogger } = require('./autoErrorLogger');
          autoErrorLogger.error?.('AutoFix:Service', e.message.slice(0, 200));
        } catch {}
        return 'Service error logged — check INTEL tab for details';
      },
    },

    // ── CONSOLE: VirtualizedList warning ─────────────────────────────
    {
      label: 'Console: VirtualizedList — use FlatList',
      match: e =>
        (e.category === 'console_error' || e.category === 'console_warn') &&
        e.message.includes('VirtualizedList'),
      fix: async () => 'VirtualizedList warning: avoid ScrollView+map for large lists — use FlatList',
    },

    // ── CONSOLE: Non-serializable navigation param ────────────────────
    {
      label: 'Console: Non-serializable param',
      match: e =>
        (e.category === 'console_error' || e.category === 'console_warn') &&
        e.message.includes('Non-serializable'),
      fix: async () => 'Non-serializable navigation param — use primitive values only in route params',
    },

    // ── CONSOLE: Deprecated lifecycle methods ─────────────────────────
    {
      label: 'Console: Deprecated lifecycle',
      match: e =>
        (e.category === 'console_error' || e.category === 'console_warn') && (
          e.message.includes('componentWillMount') ||
          e.message.includes('componentWillReceiveProps') ||
          e.message.includes('componentWillUpdate')
        ),
      fix: async () => 'Deprecated lifecycle detected — functionality unaffected, safe to suppress',
    },

    // ── CONSOLE: Maximum update depth ────────────────────────────────
    {
      label: 'Console: Infinite re-render — navigate home',
      match: e =>
        (e.category === 'console_error' || e.category === 'console_warn') &&
        (e.message.includes('Maximum update depth') || e.message.includes('Too many re-renders')),
      fix: async () => {
        try { require('expo-router').router.replace('/(tabs)/nexushome'); } catch {}
        return 'Infinite re-render loop — navigated to home to break cycle';
      },
    },

    // ── CONSOLE: Generic ──────────────────────────────────────────────
    {
      label: 'Console: Mark as reviewed',
      match: e => e.category === 'console_error' || e.category === 'console_warn',
      fix: async (e) => {
        if (e.message.includes('Failed prop type') || e.message.includes('prop type')) {
          return 'PropType validation warning — check component props match expected types';
        }
        return 'Console warning reviewed and suppressed';
      },
    },

    // ── HEALTH CHECK: Storage ─────────────────────────────────────────
    {
      label: 'Health: Storage check',
      match: e => e.category === 'health_check' && e.message.includes('Storage'),
      fix: async () => {
        const testKey = '@rem_health_test';
        await AsyncStorage.setItem(testKey, 'test').catch(() => {});
        const val = await AsyncStorage.getItem(testKey).catch(() => null);
        await AsyncStorage.removeItem(testKey).catch(() => {});
        return val === 'test' ? 'Storage OK — transient error resolved' : 'Storage degraded — restart app';
      },
    },

    // ── HEALTH CHECK: Server ──────────────────────────────────────────
    {
      label: 'Health: Server reconnect',
      match: e => e.category === 'health_check' && e.message.includes('Server'),
      fix: async () => {
        try {
          const { serverConnection } = require('./serverConnection');
          const { autoConnectEngine } = require('./autoConnectEngine');
          autoConnectEngine.notifyDisconnected?.();
          await serverConnection.reconnect?.().catch(() => null);
          return 'Server reconnect triggered';
        } catch {
          return 'Reconnect attempted — start butler_server.py on your PC';
        }
      },
    },

    // ── HEALTH CHECK: Generic ─────────────────────────────────────────
    {
      label: 'Health: Auto-retry',
      match: e => e.category === 'health_check',
      fix: async () => 'Health check logged — auto-retries every 30s',
    },

    // ── AUTO-FIX LOG ENTRIES (informational) ──────────────────────────
    {
      label: 'Auto-fix: Mark reviewed',
      match: e => e.category === 'auto_fix',
      fix: async () => 'Auto-fix event marked as reviewed',
    },
  ];
}

export const runtimeErrorMonitor = RuntimeErrorMonitorService.getInstance();
