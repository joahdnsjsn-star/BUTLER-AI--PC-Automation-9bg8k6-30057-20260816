/**
 * 🛡️ NEURAL TRIPWIRE — Behavioral Biometric Connection Guard
 *
 * Monitors roundtrip latency from the heartbeat engine to build a statistical
 * baseline of "normal" connection behaviour for this specific server/network.
 * Any session whose latency deviates >2σ from the baseline triggers an alert.
 *
 * This detects: MITM proxies, traffic inspection, rerouted packets, VPN splits.
 *
 * Fully client-side — no server endpoint required.
 * Optional: POSTs baseline to /api/security/network/baseline when available.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASELINE_KEY   = '@neural_tripwire_baseline_v1';
const STATE_KEY      = '@neural_tripwire_state_v1';
const SAMPLE_TARGET  = 20;     // samples needed before baseline is established
const CHECK_EVERY    = 5;      // compare against baseline every N new samples
const SIGMA_THRESHOLD = 2.0;   // standard deviations to trigger alert

export type TripwireStatus = 'idle' | 'learning' | 'monitoring' | 'alert' | 'disabled';

export interface TripwireBaseline {
  meanMs:   number;
  stddevMs: number;
  jitter:   number;     // max - min across samples
  samples:  number;
  savedAt:  number;     // epoch ms
  networkId: string;    // IP:port — baseline is per-server
}

export interface TripwireState {
  status:          TripwireStatus;
  samplesCollected: number;
  samplesNeeded:   number;
  baseline:        TripwireBaseline | null;
  liveLastMs:      number;
  liveMeanMs:      number;
  deviationSigma:  number;   // how many σ from baseline
  deviationRatio:  number;   // live / baseline ratio
  alertLevel:      'NONE' | 'MEDIUM' | 'HIGH';
  alertMessage:    string;
  lastChecked:     number;
}

const DEFAULT_STATE: TripwireState = {
  status:           'idle',
  samplesCollected:  0,
  samplesNeeded:     SAMPLE_TARGET,
  baseline:          null,
  liveLastMs:        0,
  liveMeanMs:        0,
  deviationSigma:    0,
  deviationRatio:    1,
  alertLevel:        'NONE',
  alertMessage:      '',
  lastChecked:       0,
};

class NeuralTripwireService {
  private static _instance: NeuralTripwireService;

  static getInstance(): NeuralTripwireService {
    if (!this._instance) this._instance = new NeuralTripwireService();
    return this._instance;
  }

  private _samples:   number[]  = [];
  private _state:     TripwireState = { ...DEFAULT_STATE };
  private _listeners: Set<(s: TripwireState) => void> = new Set();
  private _currentNetworkId = '';
  private _enabled = true;

  // ── Subscriptions ─────────────────────────────────────────────────
  subscribe(fn: (s: TripwireState) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit() {
    this._listeners.forEach(fn => { try { fn({ ...this._state }); } catch {} });
  }

  getState(): TripwireState { return { ...this._state }; }

  // ── Init / load ───────────────────────────────────────────────────
  async load(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<TripwireState>;
        this._state = { ...DEFAULT_STATE, ...saved };
      }
    } catch {}
  }

  private async _save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(this._state));
    } catch {}
  }

  // ── Called by heartbeat engine (or periodic poll) after every ping ─
  async recordLatency(ms: number, serverIp?: string, serverPort?: string): Promise<void> {
    if (!this._enabled || ms <= 0) return;

    const networkId = serverIp && serverPort ? `${serverIp}:${serverPort}` : 'unknown';

    // Reset samples if the server changed
    if (networkId !== 'unknown' && networkId !== this._currentNetworkId) {
      this._currentNetworkId = networkId;
      this._samples = [];
      this._state = { ...DEFAULT_STATE, status: 'learning', samplesNeeded: SAMPLE_TARGET };
      this._emit();
    }

    this._samples.push(ms);
    if (this._samples.length > 100) this._samples.shift(); // keep rolling window

    this._state.samplesCollected = Math.min(this._samples.length, SAMPLE_TARGET);
    this._state.liveLastMs = ms;
    this._state.lastChecked = Date.now();

    // ── Phase 1: collect baseline ───────────────────────────────────
    if (!this._state.baseline && this._samples.length < SAMPLE_TARGET) {
      this._state.status = 'learning';
      this._emit();
      return;
    }

    if (!this._state.baseline && this._samples.length >= SAMPLE_TARGET) {
      await this._buildBaseline(networkId);
      this._state.status = 'monitoring';
      this._emit();
      await this._save();
      return;
    }

    // ── Phase 2: compare against baseline every N samples ──────────
    if (this._state.baseline && this._samples.length % CHECK_EVERY === 0) {
      this._compareToBaseline();
      this._emit();
      await this._save();
    } else {
      this._emit();
    }
  }

  // ── Maths helpers ─────────────────────────────────────────────────
  private _mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private _stddev(arr: number[]): number {
    const m = this._mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
  }

  // ── Build baseline from first SAMPLE_TARGET samples ───────────────
  private async _buildBaseline(networkId: string): Promise<void> {
    const slice = this._samples.slice(0, SAMPLE_TARGET);
    const baseline: TripwireBaseline = {
      meanMs:    this._mean(slice),
      stddevMs:  this._stddev(slice),
      jitter:    Math.max(...slice) - Math.min(...slice),
      samples:   slice.length,
      savedAt:   Date.now(),
      networkId,
    };
    this._state.baseline = baseline;
    this._state.liveMeanMs = baseline.meanMs;
    this._state.deviationSigma = 0;
    this._state.deviationRatio = 1;
    this._state.alertLevel = 'NONE';
    this._state.alertMessage = '';

    // Persist baseline separately for reuse
    try {
      await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
    } catch {}

    // Optionally POST to server (fire-and-forget)
    this._postBaselineToServer(baseline).catch(() => {});
  }

  // ── Compare live samples against stored baseline ──────────────────
  private _compareToBaseline(): void {
    const bl = this._state.baseline;
    if (!bl) return;

    const recent = this._samples.slice(-10);
    const liveMean = this._mean(recent);
    this._state.liveMeanMs = Math.round(liveMean);

    const sigma = Math.max(bl.stddevMs, 1);
    const deviation = liveMean - bl.meanMs;
    const deviationSigma = deviation / sigma;
    const deviationRatio = liveMean / Math.max(bl.meanMs, 1);

    this._state.deviationSigma = Math.round(deviationSigma * 10) / 10;
    this._state.deviationRatio = Math.round(deviationRatio * 100) / 100;

    const isAnomaly = deviationSigma > SIGMA_THRESHOLD || deviationRatio > 2.5;

    if (isAnomaly) {
      const isHigh = deviationSigma > SIGMA_THRESHOLD * 1.5 || deviationRatio > 3.0;
      this._state.status = 'alert';
      this._state.alertLevel = isHigh ? 'HIGH' : 'MEDIUM';
      this._state.alertMessage =
        `Latency ${Math.round(liveMean)}ms vs baseline ${Math.round(bl.meanMs)}ms ` +
        `(${deviationRatio.toFixed(1)}× normal, ${deviationSigma.toFixed(1)}σ). ` +
        (isHigh
          ? 'Possible MITM proxy or traffic inspection detected.'
          : 'Unusual latency detected — network may be routed differently.');
    } else {
      this._state.status = 'monitoring';
      this._state.alertLevel = 'NONE';
      this._state.alertMessage = '';
    }
  }

  // ── Optional: post baseline to server ─────────────────────────────
  private async _postBaselineToServer(baseline: TripwireBaseline): Promise<void> {
    try {
      const { serverConnection } = await import('./serverConnection');
      const ip    = serverConnection.getIP?.();
      const port  = serverConnection.getPort?.();
      const token = serverConnection.getToken?.();
      if (!ip || !port) return;

      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      await fetch(`http://${ip}:${port}/api/security/network/baseline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'save', ...baseline }),
        signal: ctrl.signal,
      });
    } catch {
      // Server endpoint optional — silently ignore
    }
  }

  // ── Manual controls ───────────────────────────────────────────────
  async reset(): Promise<void> {
    this._samples = [];
    this._currentNetworkId = '';
    this._state = { ...DEFAULT_STATE, status: 'idle' };
    try {
      await AsyncStorage.multiRemove([BASELINE_KEY, STATE_KEY]);
    } catch {}
    this._emit();
  }

  async loadSavedBaseline(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(BASELINE_KEY);
      if (raw) {
        const bl = JSON.parse(raw) as TripwireBaseline;
        this._state.baseline    = bl;
        this._state.status      = 'monitoring';
        this._state.samplesCollected = SAMPLE_TARGET;
        this._currentNetworkId  = bl.networkId;
        this._emit();
      }
    } catch {}
  }

  setEnabled(v: boolean): void {
    this._enabled = v;
    if (!v) {
      this._state.status = 'disabled';
      this._emit();
    }
  }

  isEnabled(): boolean { return this._enabled; }
}

export const neuralTripwire = NeuralTripwireService.getInstance();
