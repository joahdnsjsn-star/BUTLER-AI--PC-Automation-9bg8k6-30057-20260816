/**
 * AutoResearch Service — Butler AI
 * ──────────────────────────────────────────────────────────────────
 * Passively pre-fetches relevant KB context as the user types in the
 * AI chat, so Butler AI always has fresh context ready before the
 * user hits send.
 *
 * ANTI-SPAM RULES:
 *  - Minimum 1.5s idle before any search fires
 *  - Hard rate limit: max 1 search per 3s, max 8 per minute
 *  - Same query deduplication: never re-fetch for identical text
 *  - Results cached 90s — cleared on new session
 *  - Disabled entirely when server is offline
 *  - All calls are best-effort (never throws, never blocks UI)
 */

import { knowledgeAccumulator } from '@/services/knowledgeAccumulator';
import { serverMetrics }        from '@/services/serverMetrics';

interface ResearchResult {
  query:    string;
  kbCtx:    string;
  metrics:  string;
  fetchedAt: number;
}

type ResearchListener = (result: ResearchResult) => void;

const DEBOUNCE_MS   = 1500;   // wait for typing to pause
const MIN_GAP_MS    = 3000;   // hard floor between fetches
const MAX_PER_MIN   = 8;      // spam ceiling
const CACHE_TTL_MS  = 90_000; // how long a result stays warm
const MIN_QUERY_LEN = 8;      // ignore short fragments

class AutoResearchService {
  private static _inst: AutoResearchService;

  private _timer:         ReturnType<typeof setTimeout> | null = null;
  private _lastFetchAt    = 0;
  private _fetchesThisMin = 0;
  private _minuteResetAt  = Date.now();
  private _lastQuery      = '';
  private _cache          = new Map<string, ResearchResult>();
  private _listeners      = new Set<ResearchListener>();
  private _enabled        = true;

  static getInstance() {
    if (!this._inst) this._inst = new AutoResearchService();
    return this._inst;
  }

  // ── Subscribe to pre-fetched research results ──────────────────
  onResult(fn: ResearchListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Called by the chat input onChange handler ──────────────────
  // Debounces and rate-limits automatically.
  notifyTyping(text: string): void {
    if (!this._enabled || text.trim().length < MIN_QUERY_LEN) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._tryFetch(text.trim()), DEBOUNCE_MS);
  }

  // ── Get cached result for a query (instant, no fetch) ──────────
  getCached(query: string): ResearchResult | null {
    const key = this._key(query);
    const r = this._cache.get(key);
    if (!r) return null;
    if (Date.now() - r.fetchedAt > CACHE_TTL_MS) { this._cache.delete(key); return null; }
    return r;
  }

  // ── Clear all cached results (call on session clear) ───────────
  clearCache(): void {
    this._cache.clear();
    this._lastQuery = '';
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  enable()  { this._enabled = true; }
  disable() { this._enabled = false; }

  // ── Internal fetch logic ───────────────────────────────────────
  private async _tryFetch(query: string): Promise<void> {
    try {
      // Dedup: skip if same as last successful query
      if (query === this._lastQuery) return;

      // Rate limit: max 1 fetch per MIN_GAP_MS
      const now = Date.now();
      if (now - this._lastFetchAt < MIN_GAP_MS) return;

      // Rate limit: max MAX_PER_MIN per minute
      if (now - this._minuteResetAt > 60_000) {
        this._fetchesThisMin = 0;
        this._minuteResetAt  = now;
      }
      if (this._fetchesThisMin >= MAX_PER_MIN) return;

      // Check cache
      const key = this._key(query);
      const cached = this._cache.get(key);
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        this._notify(cached);
        return;
      }

      // Fetch KB context + metrics in parallel (both best-effort)
      this._lastFetchAt = now;
      this._fetchesThisMin++;
      this._lastQuery = query;

      const [kbCtx, metrics] = await Promise.all([
        knowledgeAccumulator.buildContext(query).catch(() => ''),
        Promise.resolve(serverMetrics.getContextString()).catch(() => ''),
      ]);

      const result: ResearchResult = {
        query,
        kbCtx:     kbCtx     || '',
        metrics:   metrics   || '',
        fetchedAt: Date.now(),
      };

      this._cache.set(key, result);
      // Prune old cache entries (keep last 20)
      if (this._cache.size > 20) {
        const oldest = [...this._cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        this._cache.delete(oldest[0]);
      }

      this._notify(result);
    } catch {
      // Silently ignore — never block the UI
    }
  }

  private _notify(result: ResearchResult): void {
    this._listeners.forEach(fn => { try { fn(result); } catch {} });
  }

  private _key(query: string): string {
    // Normalise: lowercase + first 80 chars (enough for dedup)
    return query.toLowerCase().slice(0, 80).replace(/\s+/g, ' ').trim();
  }
}

export const autoResearch = AutoResearchService.getInstance();
