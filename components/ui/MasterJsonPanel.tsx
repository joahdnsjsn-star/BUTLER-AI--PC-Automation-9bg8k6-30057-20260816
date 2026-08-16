/**
 * MasterJsonPanel v7 — Butler AI
 * ─────────────────────────────────────────────────────────────────────────────
 * MULTI-QUEUE UPGRADE:
 *  • Import Queue — pick/paste multiple JSONs, they run sequentially without
 *    conflicts. Each job gets its own status badge. Add more while one is running.
 *  • Deep-merge mode — source_export sections from multiple files are MERGED
 *    (later file wins per-key), not replaced wholesale.
 *  • Smart conflict detection — warns when two queued jobs touch the same key,
 *    but still applies both (user is informed, never silently blocked).
 *  • No new banned packages. Never made stricter. Auto-applies with no modals
 *    when queue has 1 item; shows checklist for batches ≥3 files.
 *
 * SAFE PACKAGES:
 *  - Clipboard: react-native built-in Clipboard
 *  - Share: react-native Share
 *  - File picker: lazy require('expo-document-picker') inside handler
 *  - File system: expo-file-system (always allowed)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  ActivityIndicator, Alert, Platform, ScrollView,
  Animated, Modal, AppState, AppStateStatus, Share,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { haptics } from '@/services/haptics';
import { uiConfig } from '@/services/uiConfig';
import { processPowerhouseJson, ImportProgress } from '@/services/powerhouseImport';
import { jsonGuard, GuardResult, ImportDiff, GuardSnapshot, ImportLogEntry, UndoEntry } from '@/services/jsonGuard';
import {
  buildExportJson,
  DETAILED_AI_PROMPT,
  BUNDLE_MANIFEST,
  getBundleSources,
} from '@/constants/appSourceBundle';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

const C = {
  bg:       '#050810',
  surface:  '#0B0F17',
  card:     '#0B0F17',
  border:   'rgba(0,255,200,0.18)',
  cyan:     '#38D9E8',
  green:    '#2FE38A',
  amber:    '#FFB43D',
  red:      '#FF4D5E',
  purple:   '#A468FF',
  text:     '#DCE6F2',
  textMid:  '#4A9EFF',
  textDim:  '#4A9EFF',
  blue:     '#4A9EFF',
  magenta:  '#FF5FA8',
};

// ── Safe clipboard helpers (AsyncStorage-only, no expo-clipboard, no RN Clipboard API) ────
// RN 0.73+ removed Clipboard from react-native core — it resolves to undefined and crashes.
// We store the last copied value in AsyncStorage so paste still works across app sessions.
const CLIP_STORAGE_KEY = '@mjp_clipboard_v1';

async function safeSetClipboard(text: string): Promise<void> {
  // Attempt RN Clipboard if available (older RN), then fall back to AsyncStorage
  try {
    const RNC = (require('react-native') as any).Clipboard;
    if (typeof RNC?.setString === 'function') RNC.setString(text);
  } catch {}
  // Always persist to AsyncStorage — primary path on RN 0.68+
  try { await AsyncStorage.setItem(CLIP_STORAGE_KEY, text); } catch {}
}

async function safeGetClipboard(): Promise<string> {
  // Try RN Clipboard first (older RN)
  try {
    const RNC = (require('react-native') as any).Clipboard;
    if (typeof RNC?.getString === 'function') {
      const val = await RNC.getString();
      if (val && val.trim().length > 0) return val;
    }
  } catch {}
  // Fall back to AsyncStorage
  try { return (await AsyncStorage.getItem(CLIP_STORAGE_KEY)) || ''; } catch {}
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE TYPES
// ─────────────────────────────────────────────────────────────────────────────
type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface QueueJob {
  id: string;
  label: string;
  json: Record<string, any>;
  status: JobStatus;
  applied?: string[];
  error?: string;
  conflicts?: string[];   // keys that overlap with another queued job
  fileCount?: number;
  addedAt: number;
}

let _jobIdCounter = 0;
const makeJobId = () => `job_${Date.now()}_${++_jobIdCounter}`;

// ── Deep merge utility (later wins per leaf key, arrays concatenated for source_export) ──
function deepMergeJson(base: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const result = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'source_export' && base.source_export && typeof v === 'object') {
      // source_export: merge file-by-file, incoming wins per key
      result.source_export = { ...base.source_export, ...v };
    } else if (k === '_meta' && base._meta && typeof v === 'object') {
      // merge meta, keep latest exportedAt
      result._meta = { ...base._meta, ...v };
    } else if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
    ) {
      result[k] = deepMergeJson(base[k], v);
    } else {
      result[k] = v; // incoming wins
    }
  }
  return result;
}

// ── Detect key-level conflicts between two jobs ──────────────────────────
function detectConflicts(a: Record<string, any>, b: Record<string, any>): string[] {
  const conflicts: string[] = [];
  const topLevelKeys = ['tokens', 'navigation', 'features', 'server', 'ai', 'scripts', 'knowledge', 'automations', 'ui', 'assets'];
  for (const k of topLevelKeys) {
    if (k in a && k in b) conflicts.push(k);
  }
  if (a.source_export && b.source_export) {
    const aKeys = Object.keys(a.source_export);
    const bKeys = Object.keys(b.source_export);
    const shared = aKeys.filter(k => bKeys.includes(k));
    if (shared.length > 0) conflicts.push(`source_export[${shared.slice(0, 3).join(', ')}${shared.length > 3 ? '…' : ''}]`);
  }
  return conflicts;
}

type ExportFormat = 'full' | 'compact' | 'ai';

interface FileCheckItem {
  path: string;
  lines: number;
  prevLines: number;
  delta: number;
  selected: boolean;
  status: 'new' | 'grown' | 'shrunk' | 'same' | 'truncated';
}

const UNDO_TRACKED_KEYS = [
  '@ph_token_overrides_v1', '@ph_nav_overrides_v1', '@nexus_bridge_settings_v1',
  '@ph_preferred_model', '@ph_system_prompt_override', '@ph_automations',
  '@ph_assets_overrides', '@butler_ui_config_v1',
  'commandcube_server_ip', 'commandcube_server_port',
];

const AUTO_SAVE_KEY = '@butler_autosave_ts_v1';

async function captureStateSnapshot(): Promise<Record<string, any>> {
  try {
    const pairs = await AsyncStorage.multiGet(UNDO_TRACKED_KEYS).catch(() => []);
    const snap: Record<string, any> = {};
    for (const [k, v] of pairs) { if (v !== null) snap[k] = v; }
    return snap;
  } catch { return {}; }
}

async function restoreStateSnapshot(snap: Record<string, any>) {
  try {
    const pairs: [string, string][] = Object.entries(snap)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]);
    if (pairs.length > 0) await AsyncStorage.multiSet(pairs).catch(() => {});
    if (snap['@butler_ui_config_v1']) {
      await uiConfig.load().catch(() => {});
      (global as any).__nexusHomeUIConfigChanged?.();
    }
  } catch {}
}

function safeSpread(r: any): string[] {
  const out: string[] = [];
  try {
    if (Array.isArray(r?.applied))  out.push(...r.applied.filter((x: any) => typeof x === 'string'));
    if (Array.isArray(r?.warnings)) out.push(...r.warnings.filter((x: any) => typeof x === 'string'));
  } catch {}
  return out;
}

const AI_PREFIX = `You are editing Butler AI (com.butlerai.pc.automation).
Stack: React Native + Expo SDK 53 + TypeScript + Expo Router v5.
Read _meta.MASTER_AI_SYSTEM_PROMPT before making ANY changes.
RULES:
  1. Return COMPLETE files — never return diffs or partial code.
  2. Every returned file must have at least 90% of its original line count.
  3. Find the current source under each file path key (type:"source").
  4. After changes, return the FULL updated content in a code block with the filename as the first comment.
  5. Preserve ALL existing imports.
  6. Protected files: serverConnection.ts, autoConnectEngine.ts, haptics.ts — never modify logic.
The JSON export follows:
---
`;

let _lastPatchScript: string | undefined;
let _lastAiPrompt: string | undefined;
export function getLastPatchScript() { return _lastPatchScript; }
export function getLastAiPrompt() { return _lastAiPrompt; }

// ── Core apply function (shared by single + queue) ─────────────────────
async function applyJson(
  json: Record<string, any>,
  onProgress?: (p: ImportProgress) => void
): Promise<string[]> {
  const applied: string[] = [];
  try {
    if (json._master_export || json._type === 'butler_master_file') {
      if (json.ui) {
        try {
          await uiConfig.applyFromPowerhouse(json.ui);
          applied.push('UIConfig applied');
          (global as any).__nexusHomeUIConfigChanged?.();
        } catch (e: any) { applied.push('UIConfig: ' + (e?.message || 'error')); }
      }
      if (json.powerhouse) {
        try {
          const pj = { ...json.powerhouse };
          if (Array.isArray(pj.files))   pj.files   = pj.files.filter((f: any) => !f.__EXAMPLE_ONLY__);
          if (Array.isArray(pj.patches)) pj.patches = pj.patches.filter((p: any) => !p.__EXAMPLE_ONLY__);
          const r = await processPowerhouseJson(pj, onProgress);
          applied.push(...safeSpread(r));
          if (r?.patchScript) { _lastPatchScript = r.patchScript; _lastAiPrompt = r.aiPrompt; }
        } catch (e: any) { applied.push('Powerhouse: ' + (e?.message || 'error')); }
      }
      if (json.source_export) {
        const fileCount = typeof json.source_export === 'object' ? Object.keys(json.source_export).length : 0;
        applied.push(`Source export: ${fileCount} file(s) noted`);
      }
      const topLevel: Record<string, any> = {};
      ['tokens','navigation','ai','features','server','scripts','knowledge','automations','ui','assets']
        .forEach(k => { if (json[k] !== undefined) topLevel[k] = json[k]; });
      if (Object.keys(topLevel).length > 0) {
        try {
          const r = await processPowerhouseJson(topLevel, onProgress);
          applied.push(...safeSpread(r));
          if (r?.patchScript) { _lastPatchScript = r.patchScript; _lastAiPrompt = r.aiPrompt; }
        } catch (e: any) { applied.push('Top-level sections: ' + (e?.message || 'error')); }
      }
      if (applied.length === 0) applied.push('File imported — no runtime-changeable sections found.');
      return applied;
    }

    if (json._type === 'butler_ui_config' || json.home?.cards || json.strings || json.colors) {
      try {
        const section = json._type === 'butler_ui_config'
          ? { colors: json.colors, strings: json.strings, home: json.home } : json;
        await uiConfig.applyFromPowerhouse(section);
        applied.push('UIConfig applied');
        (global as any).__nexusHomeUIConfigChanged?.();
      } catch (e: any) { applied.push('UIConfig: ' + (e?.message || 'error')); }
      return applied;
    }

    if (json.files || json.patches || json.tokens || json.navigation || json.ai ||
        json.features || json.server || json.scripts || json.knowledge) {
      try {
        if (Array.isArray(json.files))   json.files   = json.files.filter((f: any) => !f.__EXAMPLE_ONLY__);
        if (Array.isArray(json.patches)) json.patches = json.patches.filter((p: any) => !p.__EXAMPLE_ONLY__);
        const r = await processPowerhouseJson(json, onProgress);
        applied.push(...safeSpread(r));
        if (r?.patchScript) { _lastPatchScript = r.patchScript; _lastAiPrompt = r.aiPrompt; }
      } catch (e: any) { applied.push('Import: ' + (e?.message || 'error')); }
      return applied;
    }

    applied.push('JSON imported — unrecognized shape, stored.');
  } catch (e: any) {
    applied.push('Import completed with errors: ' + (e?.message || 'unknown'));
  }
  return applied;
}

function buildExportString(obj: Record<string, unknown>, fmt: ExportFormat): string {
  if (fmt === 'compact') return JSON.stringify(obj);
  if (fmt === 'ai') return AI_PREFIX + JSON.stringify(obj, null, 2);
  return JSON.stringify(obj, null, 2);
}

function getExportFilename(fmt: ExportFormat): string {
  const n = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const base = `butler_master_${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}_${pad(n.getHours())}${pad(n.getMinutes())}`;
  return fmt === 'ai' ? base + '_ai_ready.txt' : base + '.json';
}

async function parseRawJson(raw: string): Promise<{ ok: boolean; json?: Record<string, any>; error?: string }> {
  let str = raw.trim();
  if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
  const jsonStart = str.indexOf('{');
  if (jsonStart > 50) str = str.slice(jsonStart);
  const check = jsonGuard.quickCheck(str);
  if (!check.ok) return { ok: false, error: check.error || 'invalid JSON' };
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'must be a JSON object' };
    return { ok: true, json: parsed };
  } catch (e: any) { return { ok: false, error: e?.message || 'parse error' }; }
}

async function buildChecklist(json: Record<string, any>): Promise<FileCheckItem[]> {
  const items: FileCheckItem[] = [];
  const lastSnap = await jsonGuard.getLastSnapshot();
  const prevMap = new Map((lastSnap?.files || []).map((f: any) => [f.path, f.lines as number]));
  const addItem = (path: string, lines: number) => {
    const prevLines = prevMap.get(path) || 0;
    const delta = lines - prevLines;
    let status: FileCheckItem['status'] = 'same';
    if (prevLines === 0) status = 'new';
    else if (delta > 0) status = 'grown';
    else if (delta < -prevLines * 0.4) status = 'truncated';
    else if (delta < 0) status = 'shrunk';
    items.push({ path, lines, prevLines, delta, selected: true, status });
  };
  if (json.source_export && typeof json.source_export === 'object') {
    for (const [k, v] of Object.entries(json.source_export)) {
      if (v && typeof v === 'object' && (v as any).type === 'source' && typeof (v as any).content === 'string')
        addItem(k, (v as any).content.split('\n').length);
    }
  }
  for (const [k, v] of Object.entries(json)) {
    if (k.startsWith('_') || k === 'source_export') continue;
    if (v && typeof v === 'object' && (v as any).type === 'source' && typeof (v as any).content === 'string')
      addItem(k, (v as any).content.split('\n').length);
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function DiffRow({ diff }: { diff: ImportDiff }) {
  const sc =
    diff.status === 'added'     ? C.green :
    diff.status === 'grown'     ? C.green :
    diff.status === 'truncated' ? C.amber :
    diff.status === 'shrunk'    ? C.amber :
    diff.status === 'removed'   ? C.red   : C.textDim;
  const sl =
    diff.status === 'added'     ? '+NEW' :
    diff.status === 'grown'     ? `+${diff.delta}L` :
    diff.status === 'truncated' ? `~${diff.delta}L` :
    diff.status === 'shrunk'    ? `${diff.delta}L` :
    diff.status === 'removed'   ? '-DEL' : '=';
  return (
    <View style={ds.row}>
      <View style={[ds.bar, { backgroundColor: sc + '70' }]} />
      <Text style={[ds.file, { color: C.textMid }]} numberOfLines={1}>{diff.path.split('/').pop()}</Text>
      <View style={[ds.badge, { borderColor: sc + '50', backgroundColor: sc + '10' }]}>
        <Text style={[ds.badgeTxt, { color: sc }]}>{sl}</Text>
      </View>
      <Text style={[ds.lines, { color: sc }]}>
        {diff.prevLines > 0 ? `${diff.prevLines}\u2192${diff.newLines}` : `${diff.newLines}L`}
      </Text>
    </View>
  );
}
const ds = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:3, borderBottomWidth:1, borderBottomColor:'#0B0F17' },
  bar:     { width:3, height:14, borderRadius:2, flexShrink:0 },
  file:    { flex:1, fontFamily:MONO, fontSize:8.5, letterSpacing:0.2, color: C.textMid },
  badge:   { borderWidth:1, borderRadius:5, paddingHorizontal:5, paddingVertical:2 },
  badgeTxt:{ fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.5 },
  lines:   { fontFamily:MONO, fontSize:8, minWidth:54, textAlign:'right' },
});

function WarningCard({ result, onDismiss }: { result: GuardResult; onDismiss: () => void }) {
  const [showDiffs, setShowDiffs] = useState(false);
  if (result.warnings.length === 0 && result.diffs.length === 0) return null;
  return (
    <View style={[wc.card, { borderColor: C.amber + '40' }]}>
      <View style={[wc.topBar, { backgroundColor: C.amber }]} />
      <View style={wc.header}>
        <MaterialIcons name="info-outline" size={16} color={C.amber} />
        <View style={{ flex: 1 }}>
          <Text style={[wc.title, { color: C.amber }]}>IMPORT NOTES</Text>
          <Text style={wc.sub}>{result.summary} — imported successfully</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <MaterialIcons name="close" size={14} color={C.textDim} />
        </TouchableOpacity>
      </View>
      {result.warnings.length > 0 ? (
        <View style={{ paddingHorizontal:12, paddingBottom:6, gap:4 }}>
          {result.warnings.map((w, i) => (
            <View key={i} style={{ flexDirection:'row', alignItems:'flex-start', gap:6 }}>
              <MaterialIcons name="warning" size={10} color={C.amber} style={{ flexShrink:0, marginTop:1 }} />
              <Text style={{ fontFamily:MONO, fontSize:8.5, color:C.amber+'CC', flex:1, lineHeight:13 }}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {result.diffs.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() => setShowDiffs(v => !v)}
            style={{ flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:6, borderTopWidth:1, borderTopColor:'#0B0F17' }}
            activeOpacity={0.8}
          >
            <MaterialIcons name={showDiffs ? 'expand-less' : 'expand-more'} size={13} color={C.blue} />
            <Text style={{ fontFamily:MONO, fontSize:9, fontWeight:'700', color:C.blue }}>
              {showDiffs ? 'HIDE' : 'SHOW'} DIFF ({result.diffs.length})
            </Text>
          </TouchableOpacity>
          {showDiffs ? (
            <View style={{ paddingHorizontal:12, paddingBottom:8 }}>
              {result.diffs.map((d, i) => <DiffRow key={i} diff={d} />)}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
const wc = StyleSheet.create({
  card:   { backgroundColor:C.card, borderRadius:11, borderWidth:1.5, overflow:'hidden', marginBottom:8 },
  topBar: { height:2 },
  header: { flexDirection:'row', alignItems:'flex-start', gap:9, padding:11 },
  title:  { fontFamily:MONO, fontSize:10, fontWeight:'900', letterSpacing:0.8 },
  sub:    { fontFamily:MONO, fontSize:8, color:C.textMid, marginTop:2 },
});

function ExportHealthGauge({ sources }: { sources: Record<string, string> }) {
  const embedded = Object.keys(sources).length;
  const total    = BUNDLE_MANIFEST.length;
  const pct      = total > 0 ? Math.round((embedded / total) * 100) : 0;
  const fillColor = pct >= 90 ? C.green : pct >= 60 ? C.amber : C.red;
  return (
    <View style={{ marginBottom:10 }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}>
        <Text style={{ fontFamily:MONO, fontSize:7, color:C.textDim, letterSpacing:1.2, fontWeight:'700' }}>EMBED COVERAGE</Text>
        <Text style={{ fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.5, color:fillColor }}>{embedded}/{total} · {pct}%</Text>
      </View>
      <View style={{ height:2, backgroundColor:'#0B0F17', borderRadius:1, overflow:'hidden', marginBottom:4 }}>
        <View style={{ height:'100%', borderRadius:1, width:`${pct}%` as any, backgroundColor:fillColor }} />
      </View>
      <Text style={{ fontFamily:MONO, fontSize:8, color: pct >= 90 ? C.green : C.amber, lineHeight:12 }}>
        {pct >= 90 ? '\u2713 All files have embedded source' : `\u26A0 ${total - embedded} files missing full source`}
      </Text>
    </View>
  );
}

function FormatToggle({ value, onChange }: { value: ExportFormat; onChange: (f: ExportFormat) => void }) {
  const fmts: { key: ExportFormat; label: string }[] = [
    { key: 'full',    label: 'FULL JSON' },
    { key: 'compact', label: 'COMPACT'   },
    { key: 'ai',      label: 'AI READY'  },
  ];
  return (
    <View style={{ marginBottom:8 }}>
      <View style={{ flexDirection:'row', gap:5, marginBottom:3 }}>
        {fmts.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptics.light(); onChange(f.key); }}
            activeOpacity={0.8}
            style={[ft.pill, value === f.key && { backgroundColor:C.cyan, borderColor:C.cyan }]}
          >
            <Text style={[ft.pillTxt, { color: value === f.key ? '#000' : C.textMid }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontFamily:MONO, fontSize:7.5, color:C.textDim, textAlign:'center' }}>
        {value === 'ai' ? '.txt AI-prompt prefixed' : value === 'compact' ? 'minified .json' : 'pretty-printed .json'}
      </Text>
    </View>
  );
}
const ft = StyleSheet.create({
  pill:    { flex:1, alignItems:'center', paddingVertical:6, borderWidth:1.5, borderRadius:8, borderColor:C.textDim+'40', backgroundColor:C.surface },
  pillTxt: { fontFamily:MONO, fontSize:8.5, fontWeight:'900', letterSpacing:0.5 },
});

function SelectiveImportModal({ visible, items, onApply, onCancel, title }: {
  visible: boolean; items: FileCheckItem[]; title?: string;
  onApply: (selected: FileCheckItem[]) => void; onCancel: () => void;
}) {
  const [list, setList] = useState<FileCheckItem[]>([]);
  useEffect(() => { setList(items); }, [items]);

  const toggle = (idx: number) => setList(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  const selectAll  = () => setList(prev => prev.map(it => ({ ...it, selected: true })));
  const selectNone = () => setList(prev => prev.map(it => ({ ...it, selected: false })));
  const selected = list.filter(it => it.selected);

  const sc = (s: FileCheckItem['status']) =>
    s === 'new' ? C.green : s === 'grown' ? C.green : s === 'shrunk' ? C.amber : s === 'truncated' ? C.red : C.textDim;
  const sl = (s: FileCheckItem['status']) =>
    s === 'new' ? '+NEW' : s === 'grown' ? 'GROW' : s === 'shrunk' ? 'SHRNK' : s === 'truncated' ? 'TRUNC' : '=';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={sim.overlay}>
        <View style={sim.card}>
          <View style={[sim.topBar, { backgroundColor:C.cyan }]} />
          <View style={sim.header}>
            <MaterialIcons name="playlist-add-check" size={18} color={C.cyan} />
            <Text style={[sim.title, { color:C.cyan }]}>{title || 'SELECT FILES TO APPLY'}</Text>
            <View style={[sim.badge, { borderColor:C.cyan+'50', backgroundColor:C.cyan+'10' }]}>
              <Text style={[sim.badgeTxt, { color:C.cyan }]}>{selected.length}/{list.length}</Text>
            </View>
          </View>
          <ScrollView style={{ maxHeight:300 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {list.map((item, idx) => {
              const itemSC = sc(item.status);
              return (
                <TouchableOpacity key={idx} onPress={() => toggle(idx)} activeOpacity={0.8} style={sim.row}>
                  <View style={[sim.check, item.selected && { backgroundColor:C.cyan, borderColor:C.cyan }]}>
                    {item.selected ? <MaterialIcons name="check" size={10} color="#000" /> : null}
                  </View>
                  <Text style={sim.fileName} numberOfLines={1}>{item.path.split('/').pop()}</Text>
                  <Text style={[sim.lineCount, { color:C.textDim }]} numberOfLines={1}>
                    {item.prevLines > 0 ? `${item.prevLines}\u2192${item.lines}L` : `${item.lines}L`}
                  </Text>
                  <View style={[sim.statusBadge, { borderColor:itemSC+'50', backgroundColor:itemSC+'10' }]}>
                    <Text style={[sim.statusTxt, { color:itemSC }]}>{sl(item.status)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={sim.footer}>
            <TouchableOpacity onPress={selectAll} style={[sim.footerBtn, { borderColor:C.cyan+'50' }]} activeOpacity={0.8}>
              <Text style={[sim.footerBtnTxt, { color:C.cyan }]}>ALL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={selectNone} style={[sim.footerBtn, { borderColor:C.textDim+'50' }]} activeOpacity={0.8}>
              <Text style={[sim.footerBtnTxt, { color:C.textDim }]}>NONE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onApply(selected)} disabled={selected.length === 0}
              style={[sim.applyBtn, { opacity: selected.length === 0 ? 0.4 : 1 }]} activeOpacity={0.85}
            >
              <MaterialIcons name="check-circle" size={14} color="#000" />
              <Text style={sim.applyTxt}>APPLY ({selected.length})</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onCancel} style={sim.cancelBtn} activeOpacity={0.8}>
            <Text style={sim.cancelTxt}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const sim = StyleSheet.create({
  overlay:    { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  card:       { backgroundColor:'#0B0F17', borderTopLeftRadius:16, borderTopRightRadius:16, borderWidth:1.5, borderColor:C.cyan+'30', maxHeight:'75%', overflow:'hidden' },
  topBar:     { height:3 },
  header:     { flexDirection:'row', alignItems:'center', gap:8, padding:14, paddingBottom:10 },
  title:      { fontFamily:MONO, fontSize:11, fontWeight:'900', letterSpacing:1, flex:1 },
  badge:      { borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:4 },
  badgeTxt:   { fontFamily:MONO, fontSize:10, fontWeight:'900' },
  row:        { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#0B0F17' },
  check:      { width:18, height:18, borderRadius:4, borderWidth:1.5, borderColor:C.textDim+'60', alignItems:'center', justifyContent:'center', flexShrink:0 },
  fileName:   { flex:1, fontFamily:MONO, fontSize:9, color:C.text },
  lineCount:  { fontFamily:MONO, fontSize:8, minWidth:60, textAlign:'right' },
  statusBadge:{ borderWidth:1, borderRadius:4, paddingHorizontal:5, paddingVertical:2, flexShrink:0 },
  statusTxt:  { fontFamily:MONO, fontSize:7.5, fontWeight:'900', letterSpacing:0.5 },
  footer:     { flexDirection:'row', gap:8, padding:12 },
  footerBtn:  { flex:1, alignItems:'center', paddingVertical:8, borderWidth:1.5, borderRadius:8 },
  footerBtnTxt:{ fontFamily:MONO, fontSize:9, fontWeight:'900' },
  applyBtn:   { flex:2, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, backgroundColor:C.cyan, borderRadius:8, paddingVertical:8 },
  applyTxt:   { fontFamily:MONO, fontSize:9, fontWeight:'900', color:'#000' },
  cancelBtn:  { alignItems:'center', paddingVertical:10, marginBottom:6 },
  cancelTxt:  { fontFamily:MONO, fontSize:10, color:C.textMid, letterSpacing:0.5 },
});

function SnapshotRow({ snap, index }: { snap: GuardSnapshot; index: number }) {
  return (
    <View style={snp.row}>
      <View style={[snp.numBox, { borderColor:C.cyan+'30' }]}>
        <Text style={[snp.num, { color:C.cyan }]}>{index + 1}</Text>
      </View>
      <View style={{ flex:1 }}>
        <Text style={snp.label} numberOfLines={1}>{snap.label}</Text>
        <Text style={snp.meta}>{new Date(snap.ts).toLocaleString()} · {snap.files.length} files · {snap.totalLines.toLocaleString()}L</Text>
      </View>
      <View style={[snp.hashBox, { borderColor:C.textDim+'30' }]}>
        <Text style={snp.hash}>{((snap.hash || '???????') + '???????').slice(0, 7)}</Text>
      </View>
    </View>
  );
}
const snp = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#0B0F17' },
  numBox:  { width:22, height:22, borderRadius:6, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
  num:     { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  label:   { fontFamily:MONO, fontSize:9.5, color:C.text, fontWeight:'700' },
  meta:    { fontFamily:MONO, fontSize:7.5, color:C.textDim, marginTop:1 },
  hashBox: { borderWidth:1, borderRadius:5, paddingHorizontal:6, paddingVertical:2 },
  hash:    { fontFamily:MONO, fontSize:7.5, color:C.textDim, letterSpacing:1 },
});

function UndoRow({ entry, index, onRestore }: { entry: UndoEntry; index: number; onRestore: (e: UndoEntry) => void }) {
  return (
    <View style={ur.row}>
      <View style={[ur.numBox, { borderColor:C.amber+'40' }]}>
        <Text style={[ur.num, { color:C.amber }]}>{index + 1}</Text>
      </View>
      <View style={{ flex:1 }}>
        <Text style={ur.label} numberOfLines={1}>{entry.label}</Text>
        <Text style={ur.meta}>{new Date(entry.ts).toLocaleTimeString()} · {Object.keys(entry.snapshot).length} keys</Text>
      </View>
      <TouchableOpacity
        onPress={() => onRestore(entry)}
        style={[ur.btn, { borderColor:C.amber+'60', backgroundColor:C.amber+'10' }]} activeOpacity={0.8}
      >
        <MaterialIcons name="undo" size={12} color={C.amber} />
        <Text style={[ur.btnTxt, { color:C.amber }]}>RESTORE</Text>
      </TouchableOpacity>
    </View>
  );
}
const ur = StyleSheet.create({
  row:    { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:7, borderBottomWidth:1, borderBottomColor:'#0B0F17' },
  numBox: { width:22, height:22, borderRadius:6, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
  num:    { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  label:  { fontFamily:MONO, fontSize:9.5, color:C.text, fontWeight:'700', flex:1 },
  meta:   { fontFamily:MONO, fontSize:7.5, color:C.textDim, marginTop:1 },
  btn:    { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:7, paddingHorizontal:8, paddingVertical:5 },
  btnTxt: { fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.3 },
});

// ── Queue Job Card ────────────────────────────────────────────────────────
function QueueJobCard({ job, onRemove }: { job: QueueJob; onRemove: (id: string) => void }) {
  const statusColor =
    job.status === 'done'    ? C.green :
    job.status === 'error'   ? C.red :
    job.status === 'running' ? C.cyan :
    job.status === 'skipped' ? C.textDim :
    C.amber;
  const statusLabel =
    job.status === 'done'    ? 'DONE' :
    job.status === 'error'   ? 'ERR' :
    job.status === 'running' ? 'RUN' :
    job.status === 'skipped' ? 'SKIP' :
    'QUEUE';
  const hasConflicts = (job.conflicts || []).length > 0;

  return (
    <View style={[qjc.card, { borderColor: statusColor + '35' }]}>
      <View style={[qjc.leftBar, { backgroundColor: statusColor }]} />
      <View style={{ flex: 1, paddingVertical: 8, paddingRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {job.status === 'running' ? (
            <ActivityIndicator size="small" color={C.cyan} style={{ width: 14 }} />
          ) : (
            <MaterialIcons
              name={
                job.status === 'done'    ? 'check-circle' :
                job.status === 'error'   ? 'error' :
                job.status === 'skipped' ? 'cancel' :
                'schedule'
              }
              size={13}
              color={statusColor}
            />
          )}
          <Text numberOfLines={1} style={{ flex:1, fontFamily:MONO, fontSize:10, fontWeight:'900', color: statusColor }}>
            {job.label}
          </Text>
          <View style={[qjc.badge, { borderColor: statusColor + '50', backgroundColor: statusColor + '12' }]}>
            <Text style={[qjc.badgeTxt, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {job.status === 'pending' ? (
            <TouchableOpacity onPress={() => onRemove(job.id)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <MaterialIcons name="close" size={13} color={C.textDim} />
            </TouchableOpacity>
          ) : null}
        </View>
        {job.fileCount !== undefined && job.fileCount > 0 ? (
          <Text style={qjc.meta}>{job.fileCount} files · {new Date(job.addedAt).toLocaleTimeString()}</Text>
        ) : (
          <Text style={qjc.meta}>{new Date(job.addedAt).toLocaleTimeString()}</Text>
        )}
        {hasConflicts ? (
          <Text style={[qjc.conflict]}>\u26A0 Overlaps: {job.conflicts!.join(', ')} (later wins)</Text>
        ) : null}
        {job.status === 'done' && job.applied && job.applied.length > 0 ? (
          <Text style={[qjc.result, { color: C.green }]} numberOfLines={2}>
            {job.applied.slice(0, 2).join(' · ')}{job.applied.length > 2 ? ` +${job.applied.length - 2} more` : ''}
          </Text>
        ) : null}
        {job.status === 'error' && job.error ? (
          <Text style={[qjc.result, { color: C.red }]} numberOfLines={2}>{job.error}</Text>
        ) : null}
      </View>
    </View>
  );
}
const qjc = StyleSheet.create({
  card:     { flexDirection:'row', backgroundColor:C.card, borderRadius:10, borderWidth:1, marginBottom:6, overflow:'hidden' },
  leftBar:  { width:3, flexShrink:0 },
  label:    {},
  badge:    { borderWidth:1, borderRadius:5, paddingHorizontal:6, paddingVertical:2, flexShrink:0 },
  badgeTxt: { fontFamily:MONO, fontSize:7.5, fontWeight:'900' },
  meta:     { fontFamily:MONO, fontSize:7.5, color:C.textDim, marginTop:2 },
  conflict: { fontFamily:MONO, fontSize:7.5, color:C.amber, marginTop:2 },
  result:   { fontFamily:MONO, fontSize:8, marginTop:3, lineHeight:12 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface Props { onApplied?: (msgs: string[]) => void; accent?: string; }
type Tab = 'main' | 'queue' | 'history' | 'snapshots' | 'undo';

export function MasterJsonPanel({ onApplied, accent = C.cyan }: Props) {
  const [exporting,      setExporting]      = useState(false);
  const [fileImporting,  setFileImporting]  = useState(false);
  const [pasteImporting, setPasteImporting] = useState(false);
  const [exportDone,     setExportDone]     = useState(false);
  const [importDone,     setImportDone]     = useState(false);
  const [statusMsg,      setStatusMsg]      = useState('');
  const [statusOk,       setStatusOk]       = useState(true);
  const [activeTab,      setActiveTab]      = useState<Tab>('main');
  const [snapshots,      setSnapshots]      = useState<GuardSnapshot[]>([]);
  const [importLog,      setImportLog]      = useState<ImportLogEntry[]>([]);
  const [undoStack,      setUndoStack]      = useState<UndoEntry[]>([]);
  const [lastWarnings,   setLastWarnings]   = useState<GuardResult | null>(null);
  const [undoing,        setUndoing]        = useState(false);
  const [promptCopied,   setPromptCopied]   = useState(false);
  const [aiCopied,       setAiCopied]       = useState(false);
  const [exportFormat,   setExportFormat]   = useState<ExportFormat>('full');
  const [cachedSources,  setCachedSources]  = useState<Record<string, string>>({});
  const [statusBannerExpanded, setStatusBannerExpanded] = useState(false);
  const [autoSavedAt,    setAutoSavedAt]    = useState(0);
  const [restoringAuto,  setRestoringAuto]  = useState(false);

  // Selective import modal
  const [selectModal,       setSelectModal]       = useState(false);
  const [fileChecklist,     setFileChecklist]     = useState<FileCheckItem[]>([]);
  const [pendingImportJson, setPendingImportJson] = useState<Record<string, any> | null>(null);
  const [pendingLabel,      setPendingLabel]      = useState('');

  // ── IMPORT QUEUE ─────────────────────────────────────────────────────────
  const [queue,          setQueue]          = useState<QueueJob[]>([]);
  const [queueRunning,   setQueueRunning]   = useState(false);
  const [mergeMode,      setMergeMode]      = useState(true);   // deep-merge vs replace
  const [autoProcess,    setAutoProcess]    = useState(true);   // auto-run queue on add
  const queueRef = useRef<QueueJob[]>([]);
  queueRef.current = queue;

  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const queuePulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    loadHistory();
    setCachedSources(getBundleSources());
    AsyncStorage.getItem(AUTO_SAVE_KEY).then(v => { if (v) setAutoSavedAt(parseInt(v, 10) || 0); }).catch(() => {});
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue:1, duration:1200, useNativeDriver:false }),
      Animated.timing(pulseAnim, { toValue:0.2, duration:1200, useNativeDriver:false }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (ns: AppStateStatus) => {
      if (ns === 'background' || ns === 'inactive') doAutoSave().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // ── Queue pulse animation ─────────────────────────────────────────────
  useEffect(() => {
    if (queueRunning) {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(queuePulse, { toValue:1, duration:400, useNativeDriver:false }),
        Animated.timing(queuePulse, { toValue:0.3, duration:400, useNativeDriver:false }),
      ]));
      anim.start();
      return () => anim.stop();
    }
  }, [queueRunning]);

  // Auto-process: when a job is added and autoProcess is on, run it
  const prevQueueLen = useRef(0);
  useEffect(() => {
    if (autoProcess && !queueRunning && queue.length > prevQueueLen.current) {
      const hasPending = queue.some(j => j.status === 'pending');
      if (hasPending) runQueue();
    }
    prevQueueLen.current = queue.length;
  }, [queue.length]);

  const doAutoSave = async () => {
    try {
      const obj = buildExportJson();
      const str = JSON.stringify(obj, null, 2);
      const dir = (FileSystem.documentDirectory || '') + 'butler_exports/';
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      await FileSystem.writeAsStringAsync(dir + 'auto_save_latest.json', str, { encoding: FileSystem.EncodingType.UTF8 });
      const ts = Date.now();
      await AsyncStorage.setItem(AUTO_SAVE_KEY, String(ts)).catch(() => {});
      setAutoSavedAt(ts);
    } catch {}
  };

  const loadHistory = async () => {
    const [snaps, log, undo] = await Promise.all([
      jsonGuard.getSnapshots(), jsonGuard.getImportLog(), jsonGuard.getUndoStack(),
    ]);
    setSnapshots(snaps); setImportLog(log); setUndoStack(undo);
  };

  // ── Conflict detection across all pending jobs ──────────────────────────
  const annotateConflicts = useCallback((jobs: QueueJob[]): QueueJob[] => {
    const pending = jobs.filter(j => j.status === 'pending');
    return jobs.map(job => {
      if (job.status !== 'pending') return job;
      const others = pending.filter(j => j.id !== job.id);
      const conflicts: string[] = [];
      for (const other of others) {
        const c = detectConflicts(job.json, other.json);
        conflicts.push(...c.filter(x => !conflicts.includes(x)));
      }
      return { ...job, conflicts };
    });
  }, []);

  // ── Add job to queue ────────────────────────────────────────────────────
  const addToQueue = useCallback((json: Record<string, any>, label: string) => {
    const fileCount = json.source_export ? Object.keys(json.source_export).length : 0;
    const job: QueueJob = {
      id: makeJobId(), label, json, status: 'pending',
      fileCount, addedAt: Date.now(), conflicts: [],
    };
    setQueue(prev => {
      const updated = annotateConflicts([...prev, job]);
      return updated;
    });
  }, [annotateConflicts]);

  // ── Remove job from queue ──────────────────────────────────────────────
  const removeJob = useCallback((id: string) => {
    setQueue(prev => annotateConflicts(prev.filter(j => j.id !== id || j.status !== 'pending')));
  }, [annotateConflicts]);

  // ── Clear completed/errored jobs ───────────────────────────────────────
  const clearDoneJobs = useCallback(() => {
    setQueue(prev => annotateConflicts(prev.filter(j => j.status === 'pending' || j.status === 'running')));
  }, [annotateConflicts]);

  // ── Run the full queue sequentially ────────────────────────────────────
  const runQueue = useCallback(async () => {
    if (queueRunning) return;
    const pending = queueRef.current.filter(j => j.status === 'pending');
    if (pending.length === 0) return;

    setQueueRunning(true);
    setActiveTab('queue');

    // Save undo state once before the whole batch
    const preState = await captureStateSnapshot();
    await jsonGuard.pushUndo(`Before batch: ${pending.length} jobs`, preState);

    // If merge mode is on and there are multiple pending jobs, deep-merge them first
    let jobsToRun = [...pending];
    if (mergeMode && pending.length > 1) {
      // Merge all pending JSONs into one mega-job
      let merged = pending[0].json;
      const labels = [pending[0].label];
      for (let i = 1; i < pending.length; i++) {
        merged = deepMergeJson(merged, pending[i].json);
        labels.push(pending[i].label);
      }
      // Mark originals as skipped
      setQueue(prev => prev.map(j =>
        pending.find(p => p.id === j.id) ? { ...j, status: 'skipped' as JobStatus } : j
      ));
      // Create a single merged job
      const mergedJob: QueueJob = {
        id: makeJobId(),
        label: `MERGED (${pending.length}) — ${labels.slice(0, 2).join(', ')}${labels.length > 2 ? '…' : ''}`,
        json: merged,
        status: 'pending',
        fileCount: merged.source_export ? Object.keys(merged.source_export).length : 0,
        addedAt: Date.now(),
        conflicts: [],
      };
      setQueue(prev => [...prev, mergedJob]);
      jobsToRun = [mergedJob];
    }

    for (const job of jobsToRun) {
      // Mark as running
      setQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running' as JobStatus } : j));
      try {
        const guard = await jsonGuard.analyzeImport(job.json, job.label);
        if (guard.warnings.length > 0 || guard.diffs.length > 0) setLastWarnings(guard);
        const applied = await applyJson(job.json);
        await jsonGuard.clearStaleCaches();
        await jsonGuard.recordSuccessfulImport(job.json, job.label, guard.diffs, guard.warnings);
        try { await uiConfig.load(); } catch {}
        (global as any).__nexusHomeUIConfigChanged?.();
        onApplied?.(applied);
        setQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'done' as JobStatus, applied } : j));
      } catch (e: any) {
        setQueue(prev => prev.map(j => j.id === job.id
          ? { ...j, status: 'error' as JobStatus, error: e?.message || 'Unknown error' } : j));
      }
    }

    await loadHistory();
    setQueueRunning(false);
    const doneCount = queueRef.current.filter(j => j.status === 'done').length;
    const errCount  = queueRef.current.filter(j => j.status === 'error').length;
    setStatusMsg(`Queue complete · ${doneCount} done · ${errCount > 0 ? `${errCount} errors` : 'no errors'}`);
    setStatusOk(errCount === 0);
    haptics.success();
    setTimeout(() => setStatusMsg(''), 8000);
  }, [queueRunning, mergeMode, onApplied]);

  // ── Core runImport (single job, non-queue path) ─────────────────────────
  const runImport = useCallback(async (
    json: Record<string, any>, label: string, onDone: (applied: string[]) => void,
  ) => {
    const preState = await captureStateSnapshot();
    await jsonGuard.pushUndo(`Before: ${label}`, preState);
    const guard = await jsonGuard.analyzeImport(json, label);
    if (guard.warnings.length > 0 || guard.diffs.length > 0) setLastWarnings(guard);
    const applied = await applyJson(json);
    await jsonGuard.clearStaleCaches();
    await jsonGuard.recordSuccessfulImport(json, label, guard.diffs, guard.warnings);
    try { await uiConfig.load(); } catch {}
    (global as any).__nexusHomeUIConfigChanged?.();
    onDone(applied);
    await loadHistory();
  }, []);

  const applySelective = useCallback(async (selected: FileCheckItem[], json: Record<string, any>, label: string) => {
    setSelectModal(false);
    if (selected.length === 0) { return; }
    const filteredJson: Record<string, any> = {};
    for (const [k, v] of Object.entries(json)) {
      if (k.startsWith('_') || k === 'source_export') { filteredJson[k] = v; continue; }
      if (v && typeof v === 'object' && (v as any).type === 'source') {
        if (selected.some(s => s.path === k)) filteredJson[k] = v;
      } else { filteredJson[k] = v; }
    }
    let applied: string[] = [];
    await runImport(filteredJson, label, (a) => { applied = a; });
    const okCount = applied.filter(a => !a.startsWith('\u26A0')).length;
    setStatusMsg(`${selected.length} files applied · ${okCount} changes · caches cleared`);
    setStatusOk(true); setImportDone(true); haptics.success();
    onApplied?.(applied);
    setTimeout(() => { setImportDone(false); setStatusMsg(''); }, 8000);
    setPendingImportJson(null); setPendingLabel('');
  }, [runImport, onApplied]);

  // ── EXPORT ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exporting) return;
    haptics.heavy(); setExporting(true); setStatusMsg('');
    try {
      const obj = buildExportJson();
      const withHash = jsonGuard.attachGuardHash(obj);
      const str = buildExportString(withHash, exportFormat);
      const filename = getExportFilename(exportFormat);
      await safeSetClipboard(DETAILED_AI_PROMPT);
      const dir  = (FileSystem.documentDirectory || '') + 'butler_exports/';
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      await FileSystem.writeAsStringAsync(dir + filename, str, { encoding: FileSystem.EncodingType.UTF8 });
      try { await Share.share({ title: filename, message: `Butler AI Export\n${filename}\n\n${str.slice(0, 400)}...` }); } catch {}
      const sources = getBundleSources();
      setExportDone(true);
      setStatusMsg(`Exported · ${Object.keys(sources).length} source files · AI prompt copied`);
      setStatusOk(true); haptics.success();
      setTimeout(() => { setExportDone(false); setStatusMsg(''); }, 6000);
    } catch (e: any) {
      setStatusMsg('Export failed: ' + (e?.message || 'Unknown'));
      setStatusOk(false); haptics.warning();
    } finally { setExporting(false); }
  }, [exporting, exportFormat]);

  // ── ADD FILES TO QUEUE (multi-file picker) ─────────────────────────────
  const handleAddFilesToQueue = useCallback(async () => {
    if (fileImporting) return;
    haptics.medium(); setFileImporting(true);
    try {
      let pickerResult: any;
      try {
        const DocumentPicker = require('expo-document-picker');
        pickerResult = await DocumentPicker.getDocumentAsync({
          type: ['application/json', 'text/plain', 'text/*', '*/*'],
          copyToCacheDirectory: true,
          multiple: true,   // allow multi-select!
        });
      } catch (e: any) {
        setStatusMsg('File picker unavailable: ' + (e?.message || ''));
        setStatusOk(false); setFileImporting(false); return;
      }

      if (pickerResult?.canceled || !pickerResult?.assets?.length) {
        setStatusMsg('No file selected');
        setStatusOk(false); setFileImporting(false); return;
      }

      let added = 0;
      let errors = 0;
      for (const asset of pickerResult.assets) {
        const fileUri: string = asset.uri || '';
        const fileName: string = asset.name || 'imported.json';
        if (!fileUri) { errors++; continue; }
        try {
          let raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
          const parsed = await parseRawJson(raw);
          if (!parsed.ok || !parsed.json) { errors++; continue; }
          addToQueue(parsed.json, 'File: ' + fileName);
          added++;
        } catch { errors++; }
      }

      const msg = added > 0
        ? `${added} file(s) added to queue${errors > 0 ? ` · ${errors} failed` : ''}`
        : `Failed to parse ${errors} file(s)`;
      setStatusMsg(msg); setStatusOk(added > 0);
      if (added > 0) { setActiveTab('queue'); haptics.success(); }
    } catch (e: any) {
      setStatusMsg('File import failed: ' + (e?.message || 'unknown'));
      setStatusOk(false);
    } finally { setFileImporting(false); }
  }, [fileImporting, addToQueue]);

  // ── IMPORT FILE (instant apply, old behavior) ──────────────────────────
  const handleFileImportDirect = useCallback(async () => {
    if (fileImporting) return;
    haptics.medium(); setFileImporting(true); setStatusMsg(''); setLastWarnings(null);
    try {
      let pickerResult: any;
      try {
        const DocumentPicker = require('expo-document-picker');
        pickerResult = await DocumentPicker.getDocumentAsync({
          type: ['application/json', 'text/plain', 'text/*', '*/*'],
          copyToCacheDirectory: true,
          multiple: false,
        });
      } catch (e: any) {
        setStatusMsg('File picker unavailable: ' + (e?.message || ''));
        setStatusOk(false); setFileImporting(false); return;
      }
      if (pickerResult?.canceled || !pickerResult?.assets?.length) {
        setStatusMsg('No file selected'); setStatusOk(false); setFileImporting(false); return;
      }
      const asset = pickerResult.assets[0];
      const fileUri: string = asset.uri || '';
      const fileName: string = asset.name || 'imported.json';
      if (!fileUri) { setStatusMsg('No file URI'); setStatusOk(false); setFileImporting(false); return; }
      let raw = '';
      try { raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 }); }
      catch (e: any) { setStatusMsg('Could not read: ' + (e?.message || '')); setStatusOk(false); setFileImporting(false); return; }
      const parsed = await parseRawJson(raw);
      if (!parsed.ok || !parsed.json) {
        setStatusMsg('Invalid JSON: ' + (parsed.error || '')); setStatusOk(false); setFileImporting(false); return;
      }
      const json = parsed.json;
      const checklist = await buildChecklist(json);
      const label = 'File: ' + fileName;
      if (checklist.length >= 3) {
        setFileChecklist(checklist); setPendingImportJson(json); setPendingLabel(label);
        setSelectModal(true); setFileImporting(false); return;
      }
      let applied: string[] = [];
      await runImport(json, label, (a) => { applied = a; });
      const okCount = applied.filter(a => !a.startsWith('\u26A0')).length;
      setStatusMsg(`Imported ${fileName} · ${okCount} changes applied`);
      setStatusOk(true); setImportDone(true); haptics.success();
      onApplied?.(applied);
      setTimeout(() => { setImportDone(false); setStatusMsg(''); }, 8000);
    } catch (e: any) {
      setStatusMsg('Import failed: ' + (e?.message || 'unknown'));
      setStatusOk(false); haptics.warning();
    } finally { setFileImporting(false); }
  }, [fileImporting, onApplied, runImport]);

  // ── PASTE FROM CLIPBOARD ───────────────────────────────────────────────
  const handlePasteImport = useCallback(async () => {
    if (pasteImporting) return;
    haptics.medium(); setPasteImporting(true); setStatusMsg(''); setLastWarnings(null);
    try {
      const raw = await safeGetClipboard();
      const parsed = await parseRawJson(raw);
      if (!parsed.ok || !parsed.json) {
        if (!raw) setStatusMsg('Clipboard is empty — copy a JSON export first');
        else setStatusMsg('Not valid JSON: ' + (parsed.error || ''));
        setStatusOk(false); setPasteImporting(false); return;
      }
      const json = parsed.json;
      const checklist = await buildChecklist(json);
      if (checklist.length >= 3) {
        setFileChecklist(checklist); setPendingImportJson(json); setPendingLabel('Clipboard Paste');
        setSelectModal(true); setPasteImporting(false); return;
      }
      let applied: string[] = [];
      await runImport(json, 'Clipboard Paste', (a) => { applied = a; });
      const okCount = applied.filter(a => !a.startsWith('\u26A0')).length;
      setStatusMsg(`Clipboard import applied · ${okCount} changes`);
      setStatusOk(true); setImportDone(true); haptics.success();
      onApplied?.(applied);
      setTimeout(() => { setImportDone(false); setStatusMsg(''); }, 8000);
    } catch (e: any) {
      setStatusMsg('Paste import failed: ' + (e?.message || 'Unknown'));
      setStatusOk(false); haptics.warning();
    } finally { setPasteImporting(false); }
  }, [pasteImporting, onApplied, runImport]);

  // ── PASTE TO QUEUE ─────────────────────────────────────────────────────
  const handlePasteToQueue = useCallback(async () => {
    haptics.medium();
    try {
      const raw = await safeGetClipboard();
      const parsed = await parseRawJson(raw);
      if (!parsed.ok || !parsed.json) {
        setStatusMsg(!raw ? 'Clipboard empty' : 'Not valid JSON: ' + (parsed.error || ''));
        setStatusOk(false); return;
      }
      const ts = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      addToQueue(parsed.json, 'Clipboard · ' + ts);
      setStatusMsg('Added clipboard JSON to queue');
      setStatusOk(true); setActiveTab('queue'); haptics.success();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (e: any) {
      setStatusMsg('Paste to queue failed: ' + (e?.message || ''));
      setStatusOk(false);
    }
  }, [addToQueue]);

  // ── COPY FOR AI ────────────────────────────────────────────────────────
  const handleCopyForAI = useCallback(async () => {
    if (aiCopied) return;
    haptics.medium(); setAiCopied(true);
    try {
      const obj = buildExportJson();
      const withHash = jsonGuard.attachGuardHash(obj);
      const fullText = AI_PREFIX + JSON.stringify(withHash, null, 2);
      await safeSetClipboard(fullText);
      const sources = getBundleSources();
      setStatusMsg(`AI prompt + export copied · ${Object.keys(sources).length} files · ${Math.round(fullText.length / 1024)}KB`);
      setStatusOk(true); haptics.success();
      setTimeout(() => { setAiCopied(false); setStatusMsg(''); }, 6000);
    } catch (e: any) {
      setStatusMsg('Copy failed: ' + (e?.message || ''));
      setStatusOk(false); setAiCopied(false);
    }
  }, [aiCopied]);

  const handleCopyPrompt = useCallback(async () => {
    haptics.medium();
    try {
      const sources = getBundleSources();
      const fullPrompt = [
        DETAILED_AI_PROMPT, '',
        '=========================================',
        `REGISTERED SOURCE FILES (${Object.keys(sources).length}):`,
        Object.keys(sources).map(p => '  - ' + p).join('\n'),
        '',
        'MULTI-FILE QUEUE WORKFLOW:',
        '1. Export JSON → saved + AI prompt auto-copied.',
        '2. Get multiple AI responses → copy each one.',
        '3. Tap PASTE TO QUEUE for each clipboard JSON.',
        '4. Tap RUN QUEUE → all JSONs merged & applied at once.',
        '5. Merge mode: later file wins per key, no destructive overwrites.',
        '6. UNDO available — batch undo restores pre-queue state.',
      ].join('\n');
      await safeSetClipboard(fullPrompt);
      setPromptCopied(true);
      setStatusMsg('AI prompt copied (' + fullPrompt.length.toLocaleString() + ' chars)');
      setStatusOk(true); haptics.success();
      setTimeout(() => { setPromptCopied(false); setStatusMsg(''); }, 6000);
    } catch (e: any) {
      setStatusMsg('Copy failed: ' + (e?.message || ''));
      setStatusOk(false);
    }
  }, []);

  const handleUndo = useCallback(async () => {
    const entry = await jsonGuard.peekUndo();
    if (!entry) { Alert.alert('Nothing to Undo', 'No previous state saved.'); return; }
    Alert.alert('Undo Import', `Restore state from before:\n"${entry.label}"\n${new Date(entry.ts).toLocaleTimeString()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'UNDO', onPress: async () => {
        haptics.heavy(); setUndoing(true);
        try {
          const popped = await jsonGuard.popUndo();
          if (popped) {
            await restoreStateSnapshot(popped.snapshot);
            setStatusMsg(`Undone: "${popped.label}" — state restored`);
            setStatusOk(true); haptics.success();
            await loadHistory();
            setTimeout(() => setStatusMsg(''), 5000);
          }
        } catch (e: any) { setStatusMsg('Undo failed: ' + (e?.message || 'unknown')); setStatusOk(false); }
        finally { setUndoing(false); }
      }},
    ]);
  }, []);

  const handleRestoreAutoSave = useCallback(async () => {
    if (restoringAuto) return;
    haptics.medium(); setRestoringAuto(true);
    try {
      const path = (FileSystem.documentDirectory || '') + 'butler_exports/auto_save_latest.json';
      const raw = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      const json = JSON.parse(raw);
      const guard = await jsonGuard.analyzeImport(json, 'Auto-Save Restore');
      if (guard.warnings.length > 0) setLastWarnings(guard);
      let applied: string[] = [];
      await runImport(json, 'Auto-Save Restore', (a) => { applied = a; });
      setStatusMsg(`Auto-save restored · ${applied.length} changes applied`);
      setStatusOk(true); haptics.success();
    } catch (e: any) {
      setStatusMsg('Auto-save restore failed: ' + (e?.message || ''));
      setStatusOk(false);
    } finally { setRestoringAuto(false); }
  }, [restoringAuto, runImport]);

  const handleClearCache = useCallback(async () => {
    haptics.medium();
    const cleared = await jsonGuard.clearStaleCaches();
    setStatusMsg(`${cleared.length} cache key(s) cleared`);
    setStatusOk(true);
    setTimeout(() => setStatusMsg(''), 4000);
  }, []);

  const handleClearHistory = useCallback(() => {
    Alert.alert('Clear History', 'Delete all import snapshots and logs?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        haptics.heavy();
        await jsonGuard.clearLog();
        setSnapshots([]); setImportLog([]); setUndoStack([]);
      }},
    ]);
  }, []);

  // ── Queue stats ────────────────────────────────────────────────────────
  const queuePending = queue.filter(j => j.status === 'pending').length;
  const queueDone    = queue.filter(j => j.status === 'done').length;
  const queueError   = queue.filter(j => j.status === 'error').length;
  const queueTotal   = queue.length;

  const TABS: { key: Tab; label: string; icon: string; color: string; badge?: number }[] = [
    { key: 'main',      label: 'TOOLS',   icon: 'import-export',  color: accent,   },
    { key: 'queue',     label: 'QUEUE',   icon: 'queue',           color: C.cyan,   badge: queuePending },
    { key: 'history',   label: 'LOG',     icon: 'history',         color: C.amber   },
    { key: 'snapshots', label: 'SNAPS',   icon: 'save',            color: C.blue    },
    { key: 'undo',      label: 'UNDO',    icon: 'undo',            color: C.magenta, badge: undoStack.length },
  ];

  const autoSaveTimeLabel = autoSavedAt > 0
    ? new Date(autoSavedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    : '\u2014';

  return (
    <View style={s.card}>
      <SelectiveImportModal
        visible={selectModal}
        items={fileChecklist}
        title={pendingLabel ? `SELECT FILES — ${pendingLabel.slice(0, 30)}` : undefined}
        onApply={(selected) => {
          if (pendingImportJson) applySelective(selected, pendingImportJson, pendingLabel);
          else { setSelectModal(false); }
        }}
        onCancel={() => { setSelectModal(false); setPasteImporting(false); setPendingImportJson(null); }}
      />

      {/* Top accent line */}
      <Animated.View style={[s.topLine, { backgroundColor: queueRunning ? C.cyan : accent, opacity: pulseAnim.interpolate({ inputRange:[0.2,1], outputRange:[0.6,1] }) }]} />

      {/* Header */}
      <View style={s.header}>
        <View style={[s.iconBox, { borderColor: accent+'60', backgroundColor: accent+'12' }]}>
          <MaterialIcons name="import-export" size={20} color={accent} />
        </View>
        <View style={{ flex:1 }}>
          <Text style={[s.title, { color: accent }]}>MASTER JSON v7</Text>
          <Text style={s.sub}>Multi-queue · Deep merge · Auto-apply · Undo</Text>
        </View>
        {queueRunning ? (
          <View style={[s.undoBadge, { borderColor:C.cyan+'60', backgroundColor:C.cyan+'12' }]}>
            <ActivityIndicator size="small" color={C.cyan} />
            <Text style={[s.undoBadgeTxt, { color:C.cyan }]}>RUNNING</Text>
          </View>
        ) : undoStack.length > 0 ? (
          <TouchableOpacity
            onPress={handleUndo} disabled={undoing}
            style={[s.undoBadge, { borderColor:C.amber+'60', backgroundColor:C.amber+'12' }]}
            hitSlop={{ top:8, bottom:8, left:8, right:8 }} activeOpacity={0.8}
          >
            {undoing ? <ActivityIndicator size="small" color={C.amber} /> : <MaterialIcons name="undo" size={14} color={C.amber} />}
            <Text style={[s.undoBadgeTxt, { color:C.amber }]}>UNDO</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats row — compact left-to-right, 4 equal cells */}
      <View style={s.statsRow}>
        {[
          { label:'SRC FILES', val: String(Object.keys(cachedSources).length), col: C.green  },
          { label:'QUEUE',     val: queueTotal > 0 ? `${queueDone}/${queueTotal}` : '0',    col: queueError > 0 ? C.red : C.cyan   },
          { label:'UNDO LVL',  val: String(undoStack.length),                                col: C.amber  },
          { label:'AUTO-SAVE', val: autoSaveTimeLabel,                                       col: C.purple },
        ].map(({ label, val, col }) => (
          <TouchableOpacity key={label} onPress={() => { haptics.light(); setStatusBannerExpanded(v => !v); }}
            style={[s.statCell, { borderColor: col+'30', borderTopColor: col, borderTopWidth: 2 }]} activeOpacity={0.8}>
            <Text style={[s.statVal, { color: col }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{val}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Inline status line when stats tapped */}
      {statusBannerExpanded && (
        <View style={{ flexDirection:'row', alignItems:'center', gap:7, paddingHorizontal:12, paddingVertical:6, borderBottomWidth:1, borderBottomColor:C.textDim+'20', backgroundColor:C.card }}>
          <MaterialIcons name="info-outline" size={11} color={C.textDim} />
          <Text style={{ fontFamily:MONO, fontSize:7.5, color:C.textDim, flex:1, lineHeight:12 }}>
            {`${Object.keys(cachedSources).length} source files · ${queueTotal} queue jobs · ${undoStack.length} undo levels · auto-save ${autoSaveTimeLabel}`}
          </Text>
          <TouchableOpacity onPress={() => setStatusBannerExpanded(false)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
            <MaterialIcons name="close" size={11} color={C.textDim} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => { haptics.light(); setActiveTab(tab.key); }}
            activeOpacity={0.8}
            style={[s.tabBtn, activeTab === tab.key && { borderColor: tab.color+'60', backgroundColor: tab.color+'10' }]}
          >
            <MaterialIcons name={tab.icon as any} size={10} color={activeTab === tab.key ? tab.color : C.textDim} />
            <Text style={[s.tabLabel, { color: activeTab === tab.key ? tab.color : C.textDim }]}>{tab.label}</Text>
            {tab.badge !== undefined && tab.badge > 0 ? (
              <View style={[s.tabBadge, { backgroundColor: tab.color }]}>
                <Text style={s.tabBadgeTxt}>{tab.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── MAIN TAB ── */}
      {activeTab === 'main' ? (
        <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
          {lastWarnings ? <WarningCard result={lastWarnings} onDismiss={() => setLastWarnings(null)} /> : null}
          <ExportHealthGauge sources={cachedSources} />
          <FormatToggle value={exportFormat} onChange={setExportFormat} />

          {/* Row 1: Export + Import File (direct apply) */}
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={handleExport} disabled={exporting}
              activeOpacity={0.85}
              style={[s.btn, exportDone
                ? { backgroundColor:C.green+'22', borderColor:C.green }
                : { backgroundColor:accent+'18', borderColor:accent+'CC' }
              ]}
            >
              {exporting ? <ActivityIndicator size="small" color={accent} /> : <MaterialIcons name={exportDone ? 'check-circle' : 'save-alt'} size={17} color={exportDone ? C.green : accent} />}
              <Text style={[s.btnTxt, { color: exportDone ? C.green : accent }]}>{exporting ? 'BUILDING...' : exportDone ? 'EXPORTED!' : 'EXPORT JSON'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleFileImportDirect} disabled={fileImporting}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.green+'70', backgroundColor: C.green+'12', opacity: fileImporting ? 0.7 : 1 }]}
            >
              {fileImporting ? <ActivityIndicator size="small" color={C.green} /> : <MaterialIcons name={importDone ? 'check-circle' : 'file-upload'} size={17} color={C.green} />}
              <Text style={[s.btnTxt, { color: C.green }]}>{fileImporting ? 'READING...' : importDone ? 'APPLIED!' : 'IMPORT FILE'}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Paste + Copy for AI */}
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={handlePasteImport} disabled={pasteImporting}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.cyan+'70', backgroundColor:C.cyan+'10', opacity: pasteImporting ? 0.6 : 1 }]}
            >
              {pasteImporting ? <ActivityIndicator size="small" color={C.cyan} /> : <MaterialIcons name={importDone ? 'check-circle' : 'content-paste'} size={17} color={importDone ? C.green : C.cyan} />}
              <Text style={[s.btnTxt, { color: importDone ? C.green : C.cyan }]}>{pasteImporting ? 'PASTING...' : importDone ? 'APPLIED!' : 'PASTE JSON'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCopyForAI} disabled={aiCopied}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.purple+'70', backgroundColor: aiCopied ? C.purple+'25' : C.purple+'10' }]}
            >
              {aiCopied ? <MaterialIcons name="check-circle" size={17} color={C.purple} /> : <MaterialIcons name="smart-toy" size={17} color={C.purple} />}
              <Text style={[s.btnTxt, { color:C.purple }]}>{aiCopied ? 'COPIED!' : 'COPY FOR AI'}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 3: Add to Queue + Paste to Queue */}
          <View style={{ flexDirection:'row', alignItems:'center', gap:5, marginBottom:6 }}>
            <View style={{ flex:1, height:1, backgroundColor:C.cyan+'20', borderRadius:1 }} />
            <Text style={{ fontFamily:MONO, fontSize:7, color:C.cyan+'70', letterSpacing:1 }}>MULTI-FILE QUEUE</Text>
            <View style={{ flex:1, height:1, backgroundColor:C.cyan+'20', borderRadius:1 }} />
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={handleAddFilesToQueue} disabled={fileImporting}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.magenta+'60', backgroundColor:C.magenta+'0C', opacity: fileImporting ? 0.6 : 1 }]}
            >
              {fileImporting ? <ActivityIndicator size="small" color={C.magenta} /> : <MaterialCommunityIcons name="file-plus-outline" size={15} color={C.magenta} />}
              <Text style={[s.btnTxt, { color:C.magenta }]} numberOfLines={1}>ADD FILE(S)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePasteToQueue}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.cyan+'60', backgroundColor:C.cyan+'0C' }]}
            >
              <MaterialIcons name="queue" size={15} color={C.cyan} />
              <Text style={[s.btnTxt, { color:C.cyan }]} numberOfLines={1}>PASTE TO QUEUE</Text>
            </TouchableOpacity>
          </View>
          {queuePending > 0 ? (
            <TouchableOpacity
              onPress={() => { haptics.heavy(); runQueue(); }}
              disabled={queueRunning}
              activeOpacity={0.85}
              style={[s.runQueueBtn, { borderColor: queueRunning ? C.cyan+'50' : C.cyan, opacity: queueRunning ? 0.7 : 1 }]}
            >
              {queueRunning ? <ActivityIndicator size="small" color={C.cyan} /> : <MaterialIcons name="play-arrow" size={18} color="#000" />}
              <Text style={s.runQueueTxt}>{queueRunning ? 'PROCESSING QUEUE...' : `RUN QUEUE (${queuePending} PENDING)`}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Row 4: Undo + Clear Cache */}
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={handleUndo} disabled={undoStack.length === 0 || undoing}
              activeOpacity={0.85}
              style={[s.btn, {
                borderColor: C.amber+(undoStack.length > 0 ? '60' : '20'),
                backgroundColor: C.amber+(undoStack.length > 0 ? '0E' : '04'),
                opacity: undoStack.length === 0 ? 0.4 : 1,
              }]}
            >
              {undoing ? <ActivityIndicator size="small" color={C.amber} /> : <MaterialIcons name="undo" size={17} color={C.amber} />}
              <Text style={[s.btnTxt, { color:C.amber }]}>{undoing ? 'UNDOING...' : `UNDO${undoStack.length > 0 ? ` (${undoStack.length})` : ''}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearCache} activeOpacity={0.85}
              style={[s.btn, { borderColor:C.purple+'45', backgroundColor:C.purple+'08' }]}>
              <MaterialIcons name="cleaning-services" size={14} color={C.purple} />
              <Text style={[s.btnTxt, { color:C.purple }]}>CLEAR CACHES</Text>
            </TouchableOpacity>
          </View>

          {/* Row 5: Copy Prompt + Auto-save */}
          <View style={s.btnRow}>
            <TouchableOpacity onPress={handleCopyPrompt} activeOpacity={0.85}
              style={[s.btn, { borderColor:C.blue+'50', backgroundColor: promptCopied ? C.blue+'18' : C.blue+'08' }]}>
              <MaterialIcons name={promptCopied ? 'check' : 'psychology'} size={14} color={C.blue} />
              <Text style={[s.btnTxt, { color:C.blue }]}>{promptCopied ? 'COPIED!' : 'COPY PROMPT'}</Text>
            </TouchableOpacity>
            {autoSavedAt > 0 ? (
              <TouchableOpacity
                onPress={handleRestoreAutoSave} disabled={restoringAuto}
                activeOpacity={0.85}
                style={[s.btn, { borderColor:C.green+'45', backgroundColor:C.green+'08', opacity: restoringAuto ? 0.6 : 1 }]}
              >
                {restoringAuto ? <ActivityIndicator size="small" color={C.green} /> : <MaterialIcons name="restore" size={14} color={C.green} />}
                <Text style={[s.btnTxt, { color:C.green }]} numberOfLines={1}>
                  {restoringAuto ? 'RESTORING...' : `RESTORE · ${autoSaveTimeLabel}`}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.btn, { borderColor:C.textDim+'20', opacity:0.35 }]}>
                <MaterialIcons name="cloud-off" size={14} color={C.textDim} />
                <Text style={[s.btnTxt, { color:C.textDim }]}>NO AUTO-SAVE</Text>
              </View>
            )}
          </View>

          {statusMsg ? (
            <View style={[s.status, {
              borderColor: statusOk ? C.green+'50' : C.red+'50',
              backgroundColor: statusOk ? C.green+'08' : C.red+'08',
            }]}>
              <MaterialIcons name={statusOk ? 'check-circle-outline' : 'error-outline'} size={13} color={statusOk ? C.green : C.red} />
              <Text style={[s.statusTxt, { color: statusOk ? C.green : C.red }]} numberOfLines={4}>{statusMsg}</Text>
            </View>
          ) : null}

          <Text style={s.footer}>v7 · Multi-queue · Deep merge · No banned packages · Auto-save · Undo</Text>
        </View>
      ) : null}

      {/* ── QUEUE TAB ── */}
      {activeTab === 'queue' ? (
        <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
          {/* Queue controls */}
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
            <Text style={[s.sectionTitle, { color:C.cyan }]}>
              IMPORT QUEUE ({queuePending} pending · {queueDone} done{queueError > 0 ? ` · ${queueError} err` : ''})
            </Text>
            <View style={{ flex:1 }} />
            {queueDone > 0 || queueError > 0 ? (
              <TouchableOpacity onPress={clearDoneJobs} activeOpacity={0.8}
                style={[s.clearBtn, { borderColor:C.textDim+'40' }]}>
                <MaterialIcons name="clear-all" size={11} color={C.textDim} />
                <Text style={[s.clearBtnTxt, { color:C.textDim }]}>CLEAR DONE</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Merge mode + auto-process toggles */}
          <View style={{ flexDirection:'row', gap:8, marginBottom:10 }}>
            <TouchableOpacity
              onPress={() => { haptics.light(); setMergeMode(v => !v); }}
              activeOpacity={0.8}
              style={[qc.toggle, mergeMode && { borderColor:C.cyan+'70', backgroundColor:C.cyan+'15' }]}
            >
              <MaterialCommunityIcons name={mergeMode ? 'merge' : 'source-fork'} size={11} color={mergeMode ? C.cyan : C.textDim} />
              <Text style={[qc.toggleTxt, { color: mergeMode ? C.cyan : C.textDim }]}>
                {mergeMode ? 'MERGE MODE ON' : 'MERGE MODE OFF'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { haptics.light(); setAutoProcess(v => !v); }}
              activeOpacity={0.8}
              style={[qc.toggle, autoProcess && { borderColor:C.green+'70', backgroundColor:C.green+'15' }]}
            >
              <MaterialIcons name={autoProcess ? 'play-circle-outline' : 'pause-circle-outline'} size={11} color={autoProcess ? C.green : C.textDim} />
              <Text style={[qc.toggleTxt, { color: autoProcess ? C.green : C.textDim }]}>
                {autoProcess ? 'AUTO-RUN ON' : 'AUTO-RUN OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Merge mode explanation */}
          {mergeMode ? (
            <View style={{ backgroundColor:C.cyan+'08', borderRadius:8, borderWidth:1, borderColor:C.cyan+'25', padding:9, marginBottom:10 }}>
              <Text style={{ fontFamily:MONO, fontSize:8, color:C.cyan+'CC', lineHeight:13 }}>
                MERGE MODE: Multiple JSONs are deep-merged before applying. Later file wins per key. source_export files are combined. Conflicts flagged but never blocked.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor:C.amber+'08', borderRadius:8, borderWidth:1, borderColor:C.amber+'25', padding:9, marginBottom:10 }}>
              <Text style={{ fontFamily:MONO, fontSize:8, color:C.amber+'CC', lineHeight:13 }}>
                SEQUENTIAL MODE: Each JSON applied one-by-one in order. Later jobs overwrite earlier changes where keys overlap.
              </Text>
            </View>
          )}

          {/* Queue list */}
          {queue.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialIcons name="queue" size={28} color={C.textDim} />
              <Text style={s.emptyTxt}>Queue is empty</Text>
              <Text style={s.emptySubTxt}>
                Use ADD FILE(S) or PASTE TO QUEUE from the main tab.{'\n'}
                Multiple JSONs run in order — later wins per key in merge mode.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight:300 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {queue.map(job => <QueueJobCard key={job.id} job={job} onRemove={removeJob} />)}
            </ScrollView>
          )}

          {/* Run button */}
          {queuePending > 0 && !queueRunning ? (
            <TouchableOpacity
              onPress={() => { haptics.heavy(); runQueue(); }}
              activeOpacity={0.85}
              style={[s.runQueueBtn, { marginTop:10 }]}
            >
              <MaterialIcons name="play-arrow" size={18} color="#000" />
              <Text style={s.runQueueTxt}>
                RUN QUEUE · {queuePending} JOB{queuePending !== 1 ? 'S' : ''}{mergeMode && queuePending > 1 ? ' (MERGED)' : ''}
              </Text>
            </TouchableOpacity>
          ) : queueRunning ? (
            <View style={[s.runQueueBtn, { borderColor:C.cyan+'50', backgroundColor:C.cyan+'18', marginTop:10 }]}>
              <ActivityIndicator size="small" color={C.cyan} />
              <Text style={[s.runQueueTxt, { color:C.cyan }]}>PROCESSING…</Text>
            </View>
          ) : null}

          {/* Add more */}
          <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
            <TouchableOpacity
              onPress={handleAddFilesToQueue} disabled={fileImporting}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.magenta+'55', backgroundColor:C.magenta+'0A', opacity: fileImporting ? 0.6 : 1 }]}
            >
              {fileImporting ? <ActivityIndicator size="small" color={C.magenta} /> : <MaterialCommunityIcons name="file-plus-outline" size={14} color={C.magenta} />}
              <Text style={[s.btnTxt, { color:C.magenta }]} numberOfLines={1}>+ ADD FILE(S)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePasteToQueue}
              activeOpacity={0.85}
              style={[s.btn, { borderColor:C.cyan+'55', backgroundColor:C.cyan+'0A' }]}
            >
              <MaterialIcons name="content-paste" size={14} color={C.cyan} />
              <Text style={[s.btnTxt, { color:C.cyan }]} numberOfLines={1}>+ PASTE</Text>
            </TouchableOpacity>
          </View>

          {statusMsg ? (
            <View style={[s.status, {
              marginTop:10,
              borderColor: statusOk ? C.green+'50' : C.red+'50',
              backgroundColor: statusOk ? C.green+'08' : C.red+'08',
            }]}>
              <MaterialIcons name={statusOk ? 'check-circle-outline' : 'error-outline'} size={13} color={statusOk ? C.green : C.red} />
              <Text style={[s.statusTxt, { color: statusOk ? C.green : C.red }]} numberOfLines={4}>{statusMsg}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' ? (
        <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
            <Text style={[s.sectionTitle, { color:C.amber }]}>IMPORT LOG ({importLog.length})</Text>
            <View style={{ flex:1 }} />
            <TouchableOpacity onPress={handleClearHistory} activeOpacity={0.8}
              style={[s.clearBtn, { borderColor:C.red+'40' }]}>
              <MaterialIcons name="delete-sweep" size={11} color={C.red} />
              <Text style={[s.clearBtnTxt, { color:C.red }]}>CLEAR</Text>
            </TouchableOpacity>
          </View>
          {importLog.length === 0 ? (
            <Text style={s.emptyTxt}>No imports yet</Text>
          ) : (
            <ScrollView style={{ maxHeight:260 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {importLog.map((entry, i) => (
                <View key={i} style={hst.row}>
                  <View style={[hst.dot, { backgroundColor: entry.ok ? C.green : C.amber }]} />
                  <View style={{ flex:1 }}>
                    <Text style={hst.label} numberOfLines={1}>{entry.label}</Text>
                    <Text style={hst.meta}>{new Date(entry.ts).toLocaleTimeString()} · {entry.filesCount} files · {entry.warnings}W</Text>
                    {entry.diffs.length > 0 ? (
                      <Text style={hst.diffs} numberOfLines={1}>
                        {entry.diffs.slice(0,3).map((d: any) =>
                          d.path.split('/').pop() + (d.delta > 0 ? '+' : '') + d.delta + 'L'
                        ).join(' · ')}{entry.diffs.length > 3 ? ` +${entry.diffs.length - 3} more` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[hst.badge, { borderColor:(entry.ok ? C.green : C.amber)+'40', backgroundColor:(entry.ok ? C.green : C.amber)+'0C' }]}>
                    <Text style={[hst.badgeTxt, { color: entry.ok ? C.green : C.amber }]}>OK</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* ── SNAPSHOTS TAB ── */}
      {activeTab === 'snapshots' ? (
        <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
            <Text style={[s.sectionTitle, { color:C.blue }]}>SNAPSHOTS ({snapshots.length}/10)</Text>
            <View style={{ flex:1 }} />
            <TouchableOpacity onPress={handleClearHistory} activeOpacity={0.8}
              style={[s.clearBtn, { borderColor:C.red+'40' }]}>
              <MaterialIcons name="delete-sweep" size={11} color={C.red} />
              <Text style={[s.clearBtnTxt, { color:C.red }]}>CLEAR</Text>
            </TouchableOpacity>
          </View>
          {snapshots.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialIcons name="save" size={28} color={C.textDim} />
              <Text style={s.emptyTxt}>No snapshots yet</Text>
              <Text style={s.emptySubTxt}>Each successful import records a snapshot</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight:280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {snapshots.map((snap, i) => <SnapshotRow key={i} snap={snap} index={i} />)}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* ── UNDO TAB ── */}
      {activeTab === 'undo' ? (
        <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
          <Text style={[s.sectionTitle, { color:C.amber, marginBottom:10 }]}>UNDO STACK ({undoStack.length}/5)</Text>
          {undoStack.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialIcons name="undo" size={28} color={C.textDim} />
              <Text style={s.emptyTxt}>No undo states yet</Text>
              <Text style={s.emptySubTxt}>State saved before each import — batch queue saves one undo for the whole batch</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight:280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {undoStack.map((entry, i) => (
                <UndoRow key={i} entry={entry} index={i} onRestore={async (e) => {
                  haptics.heavy(); setUndoing(true);
                  try {
                    await restoreStateSnapshot(e.snapshot);
                    await loadHistory();
                    setStatusMsg(`Restored: "${e.label}"`);
                    setStatusOk(true); setActiveTab('main');
                    setTimeout(() => setStatusMsg(''), 5000);
                  } catch { setStatusMsg('Restore failed'); setStatusOk(false); }
                  finally { setUndoing(false); }
                }} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const hst = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'flex-start', gap:8, paddingVertical:7, borderBottomWidth:1, borderBottomColor:'#0B0F17' },
  dot:     { width:7, height:7, borderRadius:4, marginTop:4, flexShrink:0 },
  label:   { fontFamily:MONO, fontSize:9.5, color:C.text, fontWeight:'700' },
  meta:    { fontFamily:MONO, fontSize:7.5, color:C.textDim, marginTop:1 },
  diffs:   { fontFamily:MONO, fontSize:7.5, color:C.textMid, marginTop:2 },
  badge:   { borderWidth:1, borderRadius:5, paddingHorizontal:6, paddingVertical:2, flexShrink:0 },
  badgeTxt:{ fontFamily:MONO, fontSize:8, fontWeight:'900' },
});

const qc = StyleSheet.create({
  toggle:    { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderWidth:1.5, borderRadius:9, paddingVertical:7, borderColor:C.textDim+'30', backgroundColor:C.surface },
  toggleTxt: { fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.3 },
});

const s = StyleSheet.create({
  card: {
    backgroundColor: C.bg, borderRadius:14, borderWidth:2,
    borderColor:'rgba(0,255,200,0.35)', overflow:'hidden', marginBottom:14, position:'relative',
    ...Platform.select({
      ios: { shadowColor:'#38D9E8', shadowOffset:{width:0,height:0}, shadowOpacity:0.3, shadowRadius:16 },
      android: { elevation:6 },
    }),
  },
  topLine:    { height:3 },
  header:     { flexDirection:'row', alignItems:'center', gap:10, padding:14, paddingBottom:10 },
  iconBox:    { width:40, height:40, borderRadius:10, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  title:      { fontSize:13, fontWeight:'900', fontFamily:MONO, letterSpacing:1.5 },
  sub:        { fontSize:8, color:C.textDim, fontFamily:MONO, marginTop:2, lineHeight:12 },
  undoBadge:  { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:5, flexShrink:0 },
  undoBadgeTxt:{ fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.5 },
  statsRow:   { flexDirection:'row', gap:5, paddingHorizontal:12, paddingBottom:10 },
  statCell:   { flex:1, alignItems:'center', borderWidth:1, borderRadius:8, paddingVertical:7, backgroundColor:C.surface },
  statVal:    { fontSize:11, fontWeight:'900', fontFamily:MONO },
  statLabel:  { fontSize:6, fontWeight:'700', fontFamily:MONO, color:C.textDim, letterSpacing:0.8, marginTop:2, textAlign:'center' },
  tabRow:     { flexDirection:'row', gap:4, paddingHorizontal:12, paddingBottom:10 },
  tabBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3,
    borderWidth:1.5, borderRadius:9, paddingVertical:6, borderColor:C.textDim+'30', backgroundColor:C.surface },
  tabLabel:   { fontFamily:MONO, fontSize:6.5, fontWeight:'900', letterSpacing:0.3 },
  tabBadge:   { width:12, height:12, borderRadius:6, alignItems:'center', justifyContent:'center', marginLeft:1 },
  tabBadgeTxt:{ fontFamily:MONO, fontSize:7, fontWeight:'900', color:'#000' },
  btnRow:     { flexDirection:'row', gap:8, marginBottom:8 },
  btn:        { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:11, paddingVertical:12, borderWidth:1.5 },
  btnTxt:     { fontSize:11, fontWeight:'900', fontFamily:MONO, letterSpacing:0.4 },
  runQueueBtn:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:C.cyan, borderRadius:13, paddingVertical:14, marginBottom:8, borderWidth:1.5, borderColor:C.cyan },
  runQueueTxt:{ fontFamily:MONO, fontSize:13, fontWeight:'900', color:'#000', letterSpacing:0.5 },
  status:     { flexDirection:'row', alignItems:'flex-start', gap:8, borderWidth:1, borderRadius:9, marginBottom:8, padding:10 },
  statusTxt:  { flex:1, fontFamily:MONO, fontSize:9, lineHeight:14 },
  sectionTitle:{ fontFamily:MONO, fontSize:9, fontWeight:'900', letterSpacing:1.5 },
  clearBtn:   { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:7, paddingHorizontal:7, paddingVertical:4 },
  clearBtnTxt:{ fontFamily:MONO, fontSize:8, fontWeight:'900' },
  emptyBox:   { alignItems:'center', paddingVertical:20, gap:6 },
  emptyTxt:   { fontFamily:MONO, fontSize:10, color:C.textDim, textAlign:'center' },
  emptySubTxt:{ fontFamily:MONO, fontSize:8.5, color:C.textDim+'80', textAlign:'center', lineHeight:13, maxWidth:280, marginTop:2 },
  footer:     { fontFamily:MONO, fontSize:7, color:C.textDim, textAlign:'center', lineHeight:11, marginTop:2 },
});
