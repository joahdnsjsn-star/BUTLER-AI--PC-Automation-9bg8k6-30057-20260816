/**
 * butlerAsk — one shared "ask the local AI" pipeline.
 *
 * Same transport the AI CHAT tab uses (POST /api/butler/chat on the paired
 * PC, which proxies to your self-hosted Ollama), extracted so the quick ask
 * bar above the toolbar can answer inline without duplicating the code.
 *
 * Order of attempts:
 *   1. /api/butler/chat   — butler_server.py wrapper (adds tools + memory)
 *   2. /api/chat          — raw Ollama-shaped endpoint (fallback)
 *   3. offline canned answer — never leaves the user without a reply
 *
 * LAN only. No cloud. Never throws.
 * © 2026 Andrej Sladkovic — Butler AI — ALL RIGHTS RESERVED
 */
import { serverConnection } from './serverConnection';

export type AskRole = 'user' | 'assistant';
export interface AskTurn { role: AskRole; content: string }
export interface AskResult {
  reply: string;
  online: boolean;
  model?: string;
  error?: string;
}

const SYSTEM_PROMPT =
  'You are Butler AI — a private, local PC assistant running on the user\'s own hardware. ' +
  'Answer in at most 4 short sentences unless code is requested. Be concrete and practical.';

const TIMEOUT_MS = 35_000;
const MAX_CONTEXT = 8;

// Rolling in-memory context so the quick bar behaves like a conversation.
// Deliberately NOT persisted — the full transcript lives in the AI CHAT tab.
let context: AskTurn[] = [];
let lastModel = '';

export function getAskContext(): AskTurn[] { return context.slice(); }
export function clearAskContext(): void { context = []; }
export function getLastModel(): string { return lastModel; }

function creds(): { ip: string; port: string; token: string } | null {
  try {
    const ip   = serverConnection.getIP?.()    || '';
    const port = String(serverConnection.getPort?.() || '');
    const token = serverConnection.getToken?.() || '';
    if (!ip || !port) return null;
    return { ip, port, token };
  } catch { return null; }
}

export function isLinked(): boolean {
  try { return !!serverConnection.isConnected?.() && !!creds(); } catch { return false; }
}

/** Best-effort model list from the paired PC's Ollama. Never throws. */
export async function listOllamaModels(): Promise<string[]> {
  const c = creds();
  if (!c) return [];
  const ctrl = new AbortController();
  const kill = setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000);
  try {
    const h: Record<string, string> = {};
    if (c.token) h['Authorization'] = 'Bearer ' + c.token;
    const res = await fetch(`http://${c.ip}:${c.port}/api/ollama/models`, { headers: h, signal: ctrl.signal });
    if (!res.ok) return [];
    const d: any = await res.json();
    const list: any[] = Array.isArray(d) ? d : (d?.models ?? []);
    const names = list
      .map((m) => (typeof m === 'string' ? m : m?.name ?? m?.model))
      .filter((n): n is string => typeof n === 'string' && !!n);
    if (names[0]) lastModel = names[0];
    return names;
  } catch { return []; }
  finally { clearTimeout(kill); }
}

/** Offline fallback — keeps the bar useful before the PC is paired. */
function offlineReply(q: string): string {
  const t = q.toLowerCase();
  if (/pair|connect|qr/.test(t))
    return 'Run butler_server.py on your PC, then open PAIR and scan the QR code. Auto-setup does the rest.';
  if (/ollama|model|llm/.test(t))
    return 'I answer through Ollama on your own PC. Recommended model: qwen2.5-coder:7b. Pair first, then I use it automatically.';
  if (/script|python|automat|code/.test(t))
    return 'Open FORGE for 250+ ready automation scripts — one tap runs them on the paired PC.';
  if (/cpu|ram|disk|temp|health|performance/.test(t))
    return 'Live system vitals show on HOME once your PC is paired.';
  if (/secur|privacy|encrypt|safe/.test(t))
    return 'AES-256-GCM at rest, HMAC-signed tokens, LAN-only traffic. Zero cloud, zero telemetry.';
  return 'Not linked to your PC yet, so I am answering offline. Pair via QR to route this through your local Ollama model.';
}

async function post(url: string, body: unknown, token: string, signal: AbortSignal) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal });
}

function extractReply(d: any): string {
  const raw =
    d?.reply ??
    d?.content ??
    d?.message?.content ??
    (typeof d?.message === 'string' ? d.message : '') ??
    d?.response ??
    '';
  return String(raw || '').trim();
}

/**
 * Ask the local AI. Always resolves — network faults come back as
 * `{ online:false, error }` with a usable offline reply.
 */
export async function askButler(prompt: string): Promise<AskResult> {
  const question = prompt.trim();
  if (!question) return { reply: '', online: false };

  const c = creds();
  if (!c) {
    const reply = offlineReply(question);
    context = [...context, { role: 'user', content: question }, { role: 'assistant', content: reply }].slice(-MAX_CONTEXT);
    return { reply, online: false };
  }

  const ctrl = new AbortController();
  const kill = setTimeout(() => { try { ctrl.abort(); } catch {} }, TIMEOUT_MS);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...context.slice(-MAX_CONTEXT),
    { role: 'user', content: question },
  ];

  try {
    let res = await post(`http://${c.ip}:${c.port}/api/butler/chat`, { messages }, c.token, ctrl.signal);
    // Older/leaner servers only expose the raw Ollama-shaped endpoint.
    if (res.status === 404 || res.status === 501) {
      res = await post(
        `http://${c.ip}:${c.port}/api/chat`,
        { model: lastModel || undefined, stream: false, messages },
        c.token,
        ctrl.signal,
      );
    }
    if (!res.ok) throw new Error(`Server ${res.status}`);

    const d: any = await res.json().catch(() => ({}));
    if (typeof d?.model === 'string' && d.model) lastModel = d.model;
    const reply = extractReply(d) || 'Done.';
    context = [...context, { role: 'user', content: question }, { role: 'assistant', content: reply }].slice(-MAX_CONTEXT);
    return { reply, online: true, model: lastModel };
  } catch (e: any) {
    const error = e?.name === 'AbortError' ? 'Timed out after 35s' : String(e?.message || 'Request failed').slice(0, 120);
    return { reply: offlineReply(question), online: false, error };
  } finally {
    clearTimeout(kill);
  }
}

export default askButler;
