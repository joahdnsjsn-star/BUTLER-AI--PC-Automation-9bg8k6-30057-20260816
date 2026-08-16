/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  CONNECTION HUB — Single Source of Truth v1.0       ║
 * ║  Wraps: serverConnection + autoConnectEngine +       ║
 * ║         serverFeatures + pcClipboard + qrParser +   ║
 * ║         lanScanner into ONE unified interface.       ║
 * ║                                                      ║
 * ║  Every tab imports THIS. Nothing else needed.        ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Usage:
 *   import { connectionHub } from '@/services/connectionHub';
 *
 *   // Subscribe to connection changes
 *   const unsub = connectionHub.subscribe((state) => { ... });
 *
 *   // Pair via QR
 *   const result = await connectionHub.pairQR(data);
 *
 *   // Manual connect
 *   const result = await connectionHub.connect(ip, port);
 *
 *   // Read state (sync)
 *   const { isConnected, ip, port, token, features } = connectionHub.getState();
 *
 *   // Fetch with auto-auth + remote-mode support
 *   const res = await connectionHub.fetch('/api/execute', { method: 'POST', body: ... });
 *
 *   // Power actions
 *   await connectionHub.power('sleep' | 'restart' | 'shutdown');
 *
 *   // Clipboard
 *   await connectionHub.clipboardPush(text);
 *   const text = await connectionHub.clipboardPull();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverConnection } from './serverConnection';
import { autoConnectEngine, EngineEvent, EngineStatus } from './autoConnectEngine';
import { features, ServerFeature } from './serverFeatures';
import { quickScan, ScanProgress } from './lanScanner';
import { pcClipboard } from './pcClipboard';
import { everyMs, clearKey } from './timerBus';

// ─────────────────────────────────────────────────────────────────
//  PUBLIC STATE SHAPE — returned from getState() and subscribe()
// ─────────────────────────────────────────────────────────────────
export interface HubState {
  /** Whether a server is currently reachable and authenticated */
  isConnected:   boolean;
  /** Engine lifecycle status */
  engineStatus:  EngineStatus;
  /** Server IP (empty when offline) */
  ip:            string;
  /** Server port (empty when offline) */
  port:          string;
  /** "ip:port" convenience string */
  addr:          string;
  /** Session token (empty when offline or auth-disabled) */
  token:         string;
  /** Server version string (e.g. "20.1.0") */
  serverVersion: string;
  /** Server schema (1 = legacy, 2 = typed errors + features) */
  schema:        number;
  /** Is Ollama AI online on the paired PC? null = unknown */
  ollamaOnline:  boolean | null;
  /** Is this a remote (Tailscale/Cloudflare) session? */
  isRemote:      boolean;
  /** Last measured latency in ms (0 = unknown) */
  latencyMs:     number;
  /** Timestamp of last successful ping (ms since epoch) */
  lastPingTs:    number;
  /** True while a connection attempt is in progress */
  connecting:    boolean;
  /** Capability map derived from features gate */
  caps: {
    power:     boolean;
    clipboard: boolean;
    keyboard:  boolean;
    ollama:    boolean;
    crawl:     boolean;
    execute:   boolean;
    stream:    boolean;
  };
}

export type HubListener = (state: HubState) => void;

// ─────────────────────────────────────────────────────────────────
//  RESULT TYPES
// ─────────────────────────────────────────────────────────────────
export interface HubConnectResult {
  ok:      boolean;
  addr?:   string;
  latency?: number;
  error?:  string;
}

export interface HubPowerResult {
  ok:    boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────
//  HUB CLASS
// ─────────────────────────────────────────────────────────────────
class ConnectionHub {
  private static _inst: ConnectionHub;
  private _listeners: Set<HubListener> = new Set();
  private _ollamaOnline: boolean | null = null;
  private _latencyMs   = 0;
  private _lastPingTs  = 0;
  private _serverVersion = '';
  private _schema        = 1;
  private _engineStatus: EngineStatus = 'idle';
  private _engineUnsub: (() => void) | null = null;
  private _startupTimer:  ReturnType<typeof setTimeout>  | null = null;
  private _started = false;

  static getInstance(): ConnectionHub {
    if (!this._inst) this._inst = new ConnectionHub();
    return this._inst;
  }

  // ── Seed state immediately from autoConnectEngine so getState() is
  //    accurate even before the first event fires ──────────────────────
  private _seedFromEngine(): void {
    try {
      const cur = autoConnectEngine.getCurrentConnection();
      if (cur.connected && cur.ip && cur.port) {
        this._engineStatus = 'connected';
        this._lastPingTs   = Date.now();
        // Probe capabilities in the background — non-blocking
        this._probeCapabilities().catch(() => {});
      }
    } catch {}
  }

  // ── Initialise once (called from _layout.tsx or first subscriber) ──
  start(): void {
    if (this._started) return;
    this._started = true;

    // Seed initial state synchronously before any async work
    this._seedFromEngine();

    // Wire into autoConnectEngine events
    this._engineUnsub = autoConnectEngine.onEvent((ev: EngineEvent) => {
      this._engineStatus = ev.status;
      if (ev.latencyMs)  this._latencyMs  = ev.latencyMs;
      if (ev.status === 'connected') {
        this._lastPingTs = Date.now();
        // Pull server capabilities on every new connection
        this._probeCapabilities().catch(() => {});
      }
      if (ev.status === 'idle' || ev.status === 'scanning') {
        this._ollamaOnline  = null;
        this._serverVersion = '';
        this._schema        = 1;
        features.reset();
      }
      this._notify();
    });

    // Fast startup probe — check capabilities within 1.5s of start
    // Catches the case where app restores and server was already connected
    this._startupTimer = setTimeout(() => {
      this._startupTimer = null;
      if (serverConnection.isConnected()) {
        this._probeCapabilities().catch(() => {});
      }
    }, 1_500);

    // Poll Ollama status every 20s when connected (was 30s — faster detection)
    everyMs('hub:ollama', 20_000, () => {
      if (serverConnection.isConnected()) {
        this._probeOllama().catch(() => {});
      }
    });

    // Fast ping every 8s — lightweight isAlive check, not a full capabilities probe
    // Emits 'connected' immediately when server comes back after a gap
    everyMs('hub:fastping', 8_000, () => { void (async () => {
      const ip   = serverConnection.getIP();
      const port = serverConnection.getPort();
      if (!ip || !port) return;
      if (this._engineStatus === 'connected') return; // engine already tracking
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 3_000);
        const token = serverConnection.getToken();
        const h: Record<string, string> = {};
        if (token) h['Authorization'] = `Bearer ${token}`;
        const res = await globalThis.fetch(`http://${ip}:${port}/api/status`, { headers: h, signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          features.setFromStatus(j);
          this._engineStatus = 'connected';
          this._lastPingTs   = Date.now();
          this._notify();
        }
      } catch {}
    })(); });
  }

  stop(): void {
    this._engineUnsub?.();
    this._engineUnsub = null;
    clearKey('hub:ollama');
    clearKey('hub:fastping');
    if (this._startupTimer)  { clearTimeout(this._startupTimer);   this._startupTimer  = null; }
    this._started = false;
  }

  // ── Notify connected — called by external code (QR pair, manual connect) ────
  // Ensures connectionHub state is immediately updated without waiting for engine
  notifyConnected(ip: string, port: string, latencyMs = 0): void {
    this._latencyMs  = latencyMs;
    this._lastPingTs = Date.now();
    this._engineStatus = 'connected';
    clearKey('hub:fastping');
    this._probeCapabilities().catch(() => {});
    this._notify();
  }

  // ── State snapshot ────────────────────────────────────────────
  getState(): HubState {
    const ip    = serverConnection.getIP()   || '';
    const port  = serverConnection.getPort() || '';
    const token = serverConnection.getToken() || '';
    const isConn = serverConnection.isConnected();

    return {
      isConnected:   isConn,
      engineStatus:  this._engineStatus,
      ip,
      port,
      addr:          isConn && ip ? `${ip}:${port}` : '',
      token,
      serverVersion: this._serverVersion,
      schema:        this._schema,
      ollamaOnline:  this._ollamaOnline,
      isRemote:      serverConnection.isRemoteMode(),
      latencyMs:     this._latencyMs,
      lastPingTs:    this._lastPingTs,
      connecting:    this._engineStatus === 'connecting' || this._engineStatus === 'reconnecting',
      caps: {
        power:     isConn && features.has('power'),
        clipboard: isConn && features.has('clipboard'),
        keyboard:  isConn && features.has('keyboard'),
        ollama:    isConn && features.has('ollama'),
        crawl:     isConn && features.has('crawl'),
        execute:   isConn,
        stream:    isConn && features.has('execute-stream'),
      },
    };
  }

  // ── Subscribe / unsubscribe ───────────────────────────────────
  subscribe(cb: HubListener): () => void {
    if (!this._started) this.start();
    this._listeners.add(cb);
    // Immediately deliver current state — ensures React state is populated on mount
    const s = this.getState();
    try { cb(s); } catch {}
    return () => this._listeners.delete(cb);
  }

  private _notify(): void {
    const s = this.getState();
    this._listeners.forEach(cb => { try { cb(s); } catch {} });
  }

  // ── Feature gate passthrough ──────────────────────────────────
  has(feature: ServerFeature): boolean { return features.has(feature); }

  // ─────────────────────────────────────────────────────────────
  //  CONNECTION ACTIONS
  // ─────────────────────────────────────────────────────────────

  /** Connect via QR scan data string */
  async pairQR(data: string): Promise<HubConnectResult> {
    try {
      const { parseQRConnection } = await import('./qrParser');
      const parsed = parseQRConnection(data) as any;
      if (!parsed) return { ok: false, error: 'Invalid QR code — scan the Butler server QR' };
      return await this.pair(parsed.ip, String(parsed.port), parsed.pairingCode || '');
    } catch (e: any) {
      return { ok: false, error: e?.message || 'QR parse error' };
    }
  }

  /** Full HMAC pair (QR pairing code required for locked servers) */
  async pair(ip: string, port: string, pairingCode = ''): Promise<HubConnectResult> {
    this._engineStatus = 'connecting';
    this._notify();
    try {
      const result = await serverConnection.pair(ip, port, pairingCode);
      if (result.success) {
        this._latencyMs = result.latency ?? 0;
        this._lastPingTs = Date.now();
        autoConnectEngine.notifyConnected(ip, serverConnection.getPort() || port, this._latencyMs);
        await this._probeCapabilities().catch(() => {});
        this._engineStatus = 'connected';
        this._notify();
        return { ok: true, addr: `${ip}:${serverConnection.getPort() || port}`, latency: this._latencyMs };
      }
      this._engineStatus = 'idle';
      this._notify();
      return { ok: false, error: result.error || 'Pair failed' };
    } catch (e: any) {
      this._engineStatus = 'idle';
      this._notify();
      return { ok: false, error: e?.message || 'Pair error' };
    }
  }

  /** Manual IP connect (no QR, no pairingCode required) */
  async connect(ip: string, port: string): Promise<HubConnectResult> {
    this._engineStatus = 'connecting';
    this._notify();
    try {
      const result = await serverConnection.connectManual(ip, port);
      if (result.connected) {
        this._latencyMs  = result.latency ?? 0;
        this._lastPingTs = Date.now();
        autoConnectEngine.notifyConnected(ip, serverConnection.getPort() || port, this._latencyMs);
        await this._probeCapabilities().catch(() => {});
        this._engineStatus = 'connected';
        this._notify();
        return { ok: true, addr: `${ip}:${serverConnection.getPort() || port}`, latency: this._latencyMs };
      }
      this._engineStatus = 'idle';
      this._notify();
      return { ok: false, error: result.error || 'Connect failed' };
    } catch (e: any) {
      this._engineStatus = 'idle';
      this._notify();
      return { ok: false, error: e?.message || 'Connect error' };
    }
  }

  /** Re-verify existing saved connection */
  async reconnect(): Promise<HubConnectResult> {
    const ip   = serverConnection.getIP();
    const port = serverConnection.getPort();
    if (!ip || !port) return { ok: false, error: 'No saved server — scan QR to pair' };
    return this.connect(ip, port);
  }

  /** Disconnect from the current server */
  async disconnect(): Promise<void> {
    await serverConnection.disconnect();
    this._ollamaOnline  = null;
    this._serverVersion = '';
    this._schema        = 1;
    this._latencyMs     = 0;
    features.reset();
    autoConnectEngine.notifyDisconnected();
    this._engineStatus = 'idle';
    this._notify();
  }

  /** Run a LAN scan and return discovered servers */
  async lanScan(onProgress?: (p: ScanProgress) => void): Promise<{ ip: string; port: number }[]> {
    return new Promise((resolve) => {
      const found: { ip: string; port: number }[] = [];
      quickScan((progress) => {
        if (progress.found.length > 0) {
          progress.found.forEach(f => {
            if (!found.find(x => x.ip === f.ip)) found.push({ ip: f.ip, port: f.port });
          });
        }
        onProgress?.(progress);
      }).then(() => resolve(found)).catch(() => resolve(found));
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  AUTHENTICATED FETCH — single entry point for ALL API calls
  // ─────────────────────────────────────────────────────────────

  /**
   * Make an authenticated request to the paired server.
   * Handles: token injection, X-Device-Id, remote-mode URL rewrite,
   * 401 auto-heal, AbortController timeout (default 15s).
   *
   * @param path  Server path e.g. '/api/execute'
   * @param opts  Standard RequestInit + optional timeoutMs
   */
  async fetch(
    path: string,
    opts: RequestInit & { timeoutMs?: number } = {}
  ): Promise<Response> {
    // Guard: must be connected before attempting
    const ip   = serverConnection.getIP();
    const port = serverConnection.getPort();
    if (!ip || !port) {
      throw new Error('Not connected — pair PC first');
    }
    const url = serverConnection.buildUrl(path);
    const { timeoutMs = 15_000, ...fetchOpts } = opts;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await serverConnection.fetchWithAuth(url, {
        ...fetchOpts,
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      // Auto-heal: if 401, attempt reconnect once and retry
      if (res.status === 401) {
        await this.reconnect().catch(() => {});
        const retryCtrl = new AbortController();
        const retryTid  = setTimeout(() => retryCtrl.abort(), timeoutMs);
        try {
          const retryRes = await serverConnection.fetchWithAuth(url, {
            ...fetchOpts,
            signal: retryCtrl.signal,
          });
          clearTimeout(retryTid);
          return retryRes;
        } catch (retryErr) {
          clearTimeout(retryTid);
          throw retryErr;
        }
      }
      return res;
    } catch (e: any) {
      clearTimeout(tid);
      // AbortError → friendly timeout message
      if (e?.name === 'AbortError') {
        throw new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw e;
    }
  }

  /**
   * Execute a Python script on the paired PC.
   * Streams output via onChunk if the server supports it.
   */
  async execute(
    script: string,
    onChunk?: (line: string) => void,
    timeoutMs = 60_000
  ): Promise<{ output: string; error: string; success: boolean; ms: number }> {
    const ip    = serverConnection.getIP();
    const port  = serverConnection.getPort();
    const token = serverConnection.getToken();
    if (!ip || !port) return { output: '', error: 'Not connected — pair PC first', success: false, ms: 0 };

    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const deviceId = serverConnection.getDeviceId();
      if (deviceId) headers['X-Device-Id'] = deviceId;

      const res = await globalThis.fetch(`http://${ip}:${port}/api/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ script }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        if (res.status === 401) {
          await this.reconnect().catch(() => {});
          return { output: '', error: 'Session expired — retap RUN to retry', success: false, ms: Date.now() - start };
        }
        return { output: '', error: `Server error ${res.status}`, success: false, ms: Date.now() - start };
      }

      let fullText = '';
      const reader = res.body?.getReader();
      if (reader) {
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          fullText += chunk;
          chunk.split('\n').forEach(l => { if (l.trim()) onChunk?.(l); });
        }
      } else {
        fullText = await res.text();
        fullText.split('\n').forEach(l => { if (l.trim()) onChunk?.(l); });
      }

      let data: any = {};
      try { data = JSON.parse(fullText); } catch { data = { output: fullText }; }
      const raw     = (data.output || '').trim();
      const hasErr  = raw.toLowerCase().includes('traceback') || raw.toLowerCase().includes('error:');
      const success = !hasErr && !data.error;
      return { output: success ? raw : '', error: hasErr ? raw : (data.error || ''), success, ms: Date.now() - start };
    } catch (e: any) {
      const ms = Date.now() - start;
      if (e?.name === 'AbortError') return { output: '', error: `Timeout after ${Math.round(timeoutMs / 1000)}s`, success: false, ms };
      return { output: '', error: e?.message || 'Request failed', success: false, ms };
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  POWER ACTIONS
  // ─────────────────────────────────────────────────────────────
  async power(action: 'sleep' | 'restart' | 'shutdown'): Promise<HubPowerResult> {
    try {
      const result = await pcClipboard.powerAction(action);
      return { ok: result.ok, error: result.error };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Power action failed' };
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  CLIPBOARD
  // ─────────────────────────────────────────────────────────────
  async clipboardPush(text: string): Promise<boolean> {
    return pcClipboard.pushToPC(text);
  }

  async clipboardPull(): Promise<string> {
    return pcClipboard.pullFromPC();
  }

  async clipboardSync(): Promise<{ ok: boolean; text: string }> {
    return pcClipboard.syncBidirectional();
  }

  // ─────────────────────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────
  private async _probeCapabilities(): Promise<void> {
    const ip    = serverConnection.getIP();
    const port  = serverConnection.getPort();
    const token = serverConnection.getToken();
    if (!ip || !port) return;

    // Probe /api/status → populate feature gate + version
    // Retry once on failure (handles server starting up slightly after connect)
    let probeOk = false;
    for (let attempt = 0; attempt < 2 && !probeOk; attempt++) {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 5_000);
        const h: Record<string, string> = {};
        if (token) h['Authorization'] = `Bearer ${token}`;
        const res = await globalThis.fetch(`http://${ip}:${port}/api/status`, {
          headers: h, signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          features.setFromStatus(j);
          this._serverVersion = j.serverVersion || j.version || j.server_version || '';
          this._schema        = j.schema || 1;
          probeOk = true;
          this._notify();
        }
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 800)); // brief retry delay
      }
    }

    // Probe Ollama in parallel with a short delay to not compete with /api/status
    setTimeout(() => { this._probeOllama().catch(() => {}); }, 200);
  }

  private async _probeOllama(): Promise<void> {
    const ip    = serverConnection.getIP();
    const port  = serverConnection.getPort();
    const token = serverConnection.getToken();
    if (!ip || !port) return;
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 4_000);
      const h: Record<string, string> = {};
      if (token) h['Authorization'] = `Bearer ${token}`;
      const res = await globalThis.fetch(`http://${ip}:${port}/api/ollama/status`, {
        headers: h, signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        const prev = this._ollamaOnline;
        // Accept 'online', 'running', or presence of a model as proof Ollama is available
        this._ollamaOnline = d.online ?? d.running ?? (d.model ? true : false) ?? false;
        if (prev !== this._ollamaOnline) this._notify();
      } else {
        if (this._ollamaOnline !== false) {
          this._ollamaOnline = false;
          this._notify();
        }
      }
    } catch {
      if (this._ollamaOnline !== false) {
        this._ollamaOnline = false;
        this._notify();
      }
    }
  }
}

export const connectionHub = ConnectionHub.getInstance();

// Convenience wrapper for external callers that only import this symbol
// instead of the full class method
export function notifyHubConnected(ip: string, port: string, latencyMs = 0): void {
  connectionHub.notifyConnected(ip, port, latencyMs);
}

// ─────────────────────────────────────────────────────────────────
//  CONVENIENCE RE-EXPORTS so callers don't need multiple imports
// ─────────────────────────────────────────────────────────────────
export { serverConnection } from './serverConnection';
export { autoConnectEngine } from './autoConnectEngine';
export type { ServerFeature } from './serverFeatures';
export type { EngineStatus, EngineEvent } from './autoConnectEngine';
export type { ScanProgress } from './lanScanner';
