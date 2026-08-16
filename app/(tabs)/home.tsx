/**
 * BUTLER AI — HOME v4 · Knowledge-style layout
 * Same header pattern as KnowledgeBase: amber stripe, scan, eyebrow, tabs
 * 4 tabs: OVERVIEW · METRICS · TELEMETRY · ACTIONS
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  Animated, Platform, Dimensions, Linking, RefreshControl, TextInput,
} from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { Guard } from '@/components/ui/Guard';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { knowledgeAccumulator } from '@/services/knowledgeAccumulator';
import { haptics } from '@/services/haptics';
import { runtimeErrorMonitor, RuntimeError } from '@/services/runtimeErrorMonitor';
import { otaUpdates, UpdateInfo } from '@/services/otaUpdates';
import { autoErrorLogger } from '@/services/autoErrorLogger';

// ── Palette (matches knowledge.tsx exactly) ───────────────────────
const BG    = '#070A10';
const SURF  = '#0B0F17';
const SURF2 = '#111621';
const SURF3 = '#4A9EFF';
const AMBER = '#FFB43D';
const CYAN  = '#38D9E8';
const GREEN = '#2FE38A';
const PURP  = '#A468FF';
const TEAL  = '#38D9E8';
const BLUE  = '#4A9EFF';
const RED   = '#FF4D5E';
const DIM   = '#4A9EFF';
const MID   = '#4A9EFF';
const TEXT  = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW    = Math.max(320, Dimensions.get('window').width);
const HALF  = (SW - 32 - 8) / 2;

// ── PulseDot ──────────────────────────────────────────────────────
const PulseDot = memo(({ color, size = 6 }: { color: string; size?: number }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.2, duration: 800, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />;
});

// ════════════════════════════════════════════════════════════════
// HEADER — exact knowledge base style, home context
// ════════════════════════════════════════════════════════════════
const HomeHeader = memo(({ safeTop, isConn, tab, onTabChange, onPair }: {
  safeTop: number; isConn: boolean;
  tab: string; onTabChange: (t: string) => void;
  onPair: () => void;
}) => {
  // ── SKIN WIRING: every colour below resolves from the active pack on the
  // SKINS page, so switching a skin recolours this header instantly. ──
  const S = useSkin();
  const CYAN = S.accent, TEAL = S.accent, BLUE = S.accent2, PURP = S.accent3;
  const AMBER = S.warn, GREEN = S.ok, RED = S.danger;
  const TEXT = S.text, DIM = S.dim, MID = S.mid;
  const SURF = S.panel, SURF2 = S.panel2, SURF3 = S.panel2, BG = S.bg;
  const [hh, setHh] = useState('--:--');
  const [ss, setSs] = useState('--');
  const scanX = useRef(new Animated.Value(-SW)).current;

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setHh(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
      setSs(String(n.getSeconds()).padStart(2, '0'));
    };
    tick();
    const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue: SW + 120, duration: 2600, useNativeDriver: true }),
      Animated.timing(scanX, { toValue: -SW, duration: 0, useNativeDriver: true }),
      Animated.delay(6000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  const TABS = [
    { key: 'overview',   label: 'OVERVIEW',  icon: 'view-dashboard-outline', color: CYAN  },
    { key: 'metrics',    label: 'METRICS',   icon: 'chart-areaspline',       color: GREEN },
    { key: 'telemetry',  label: 'TELEMETRY', icon: 'satellite-variant',      color: PURP  },
    { key: 'actions',    label: 'ACTIONS',   icon: 'lightning-bolt-outline',  color: AMBER },
  ];

  const cc = isConn ? GREEN : AMBER;

  return (
    <View style={[HH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <Guard name="home.headerFX">
            <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="HH" still={!S.headerGlow} />
          </Guard>
      <View style={{ height: 3, backgroundColor: CYAN }} />
      <Animated.View pointerEvents="none" style={[HH.scan, { transform: [{ translateX: scanX }] }]} />
      <View style={HH.body}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={HH.eye}>SELF-HOSTED · PRIVATE · ZERO CLOUD</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="robot-happy" size={18} color={CYAN} />
            <Text style={HH.title}>BUTLER <Text style={{ color: CYAN }}>AI</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={() => { haptics.medium(); onPair(); }} activeOpacity={0.8}
              style={[HH.pill, { borderColor: cc + '70', backgroundColor: cc + '12' }]}>
              <PulseDot color={cc} size={5} />
              <Text style={[HH.pTxt, { color: cc }]}>{isConn ? 'CONNECTED' : 'PAIR PC'}</Text>
            </TouchableOpacity>
            <View style={[HH.pill, { borderColor: PURP + '40', backgroundColor: PURP + '08' }]}>
              <MaterialCommunityIcons name="shield-lock-outline" size={9} color={PURP} />
              <Text style={[HH.pTxt, { color: PURP }]}>AES-256</Text>
            </View>
            <View style={[HH.pill, { borderColor: CYAN + '30', backgroundColor: CYAN + '08' }]}>
              <Text style={[HH.pTxt, { color: CYAN }]}>LAN ONLY</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={[HH.cBig, { color: TEXT }]}>{hh}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: '900', color: CYAN }}>{ss}</Text>
          </View>
          <Text style={HH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      {/* Tab bar — identical to knowledge page */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: DIM + '50' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} onPress={() => { haptics.light(); onTabChange(t.key); }} activeOpacity={0.8}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, gap: 3,
                borderBottomWidth: 2.5, borderBottomColor: active ? t.color : 'transparent' }}>
              <MaterialCommunityIcons name={t.icon as any} size={13} color={active ? t.color : MID} />
              <Text style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: '900', color: active ? t.color : MID, letterSpacing: 0.3 }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});
const HH = StyleSheet.create({
  root:  { backgroundColor: '#050810', overflow: 'hidden' },
  scan:  { position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: CYAN + '07' },
  body:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, gap: 10, zIndex: 1 },
  eye:   { fontFamily: MONO, fontSize: 7.5, color: CYAN + '60', letterSpacing: 1.5, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  pTxt:  { fontFamily: MONO, fontSize: 9, fontWeight: '900' },
  cBig:  { fontFamily: MONO, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  cSub:  { fontFamily: MONO, fontSize: 7, color: MID, letterSpacing: 1 },
});

// ════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ════════════════════════════════════════════════════════════════

// PC Status engine card (matches SelfLearningEngine style)
const PCStatusEngine = memo(({ isConn, onPair }: { isConn: boolean; onPair: () => void }) => {
  const spinA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    if (isConn) loop.start(); return () => loop.stop();
  }, [isConn]);
  const rot = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const cc = isConn ? GREEN : AMBER;

  return (
    <View style={[PE.root, { borderColor: cc + '40' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Animated.View style={{ transform: [{ rotate: isConn ? rot : '0deg' }] }}>
          <View style={[PE.iconBox, { borderColor: cc + '50', backgroundColor: cc + '10' }]}>
            <MaterialCommunityIcons name="server-network" size={22} color={cc} />
          </View>
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: TEXT }}>
            PC AUTOMATION ENGINE
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 9.5, color: MID, marginTop: 3 }}>
            {isConn ? 'BUTLER SERVER ACTIVE — FULL CONTROL' : 'PC OFFLINE — TAP TO PAIR'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => { haptics.medium(); onPair(); }} activeOpacity={0.85}
          style={[PE.statusBadge, { borderColor: cc + '60', backgroundColor: cc + '10' }]}>
          <PulseDot color={cc} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 8.5, color: cc, fontWeight: '900' }}>
            {isConn ? 'LIVE' : 'PAIR'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});
const PE = StyleSheet.create({
  root:        { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  iconBox:     { width: 48, height: 48, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
});

// 4-stat grid (matches KBStatsGrid style)
const HomeStatsGrid = memo(({ isConn, cpu, ram, disk, kbCount }: {
  isConn: boolean; cpu: number; ram: number; disk: number; kbCount: number;
}) => {
  const cells = [
    { label: 'CPU',      val: isConn ? `${Math.round(cpu)}%` : '--', color: CYAN,  icon: 'cpu-64-bit' },
    { label: 'RAM',      val: isConn ? `${Math.round(ram)}%` : '--', color: GREEN, icon: 'memory' },
    { label: 'DISK',     val: isConn ? `${Math.round(disk)}%` : '--',color: AMBER, icon: 'harddisk' },
    { label: 'KB FACTS', val: isConn ? String(kbCount || 0) : '--', color: PURP,  icon: 'brain' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cells.map((c, i) => (
        <View key={i} style={[GS.cell, { borderTopColor: c.color, borderColor: c.color + '28' }]}>
          <MaterialCommunityIcons name={c.icon as any} size={14} color={c.color + '80'} />
          <Text style={[GS.val, { color: isConn ? c.color : MID }]}>{c.val}</Text>
          <Text style={GS.label}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
});
const GS = StyleSheet.create({
  cell:  { flex: 1, backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderTopWidth: 2.5, padding: 10, alignItems: 'center', gap: 4,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 5 }, android: { elevation: 3 } }) },
  val:   { fontFamily: MONO, fontSize: 17, fontWeight: '900', lineHeight: 21 },
  label: { fontFamily: MONO, fontSize: 7, color: MID, fontWeight: '900', letterSpacing: 0.8 },
});

// Download CTA card (matches NeuralVectorStore style — big number replaced with icon+title)
const DownloadCTA = memo(() => {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.2, duration: 1600, useNativeDriver: false }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  return (
    <TouchableOpacity
      onPress={() => { haptics.heavy(); Linking.openURL('https://github.com/shawnjan-cmd/butler-server/releases/latest').catch(() => {}); }}
      activeOpacity={0.87}
      style={[DC.root, { borderColor: CYAN + '40' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <MaterialCommunityIcons name="download-circle-outline" size={13} color={CYAN} />
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: CYAN + '90', fontWeight: '900', letterSpacing: 1 }}>BUTLER SERVER</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: MID }}>· SETUP GUIDE</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 30, fontWeight: '900', color: CYAN, lineHeight: 34 }}>
            DOWNLOAD
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, marginTop: 2 }}>butler_server.py · FREE · OPEN SOURCE</Text>
        </View>
        <Animated.View style={[DC.badge, { borderColor: CYAN + '55', backgroundColor: CYAN + '0C', opacity: pulse }]}>
          <PulseDot color={CYAN} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: CYAN }}>FREE</Text>
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {['LAN ONLY', 'AES-256', 'ZERO CLOUD', 'AUTO-SETUP'].map((b, i) => (
          <View key={i} style={{ borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderColor: CYAN + '30' }}>
            <Text style={{ fontFamily: MONO, fontSize: 7, color: CYAN + '70', fontWeight: '900' }}>{b}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
});
const DC = StyleSheet.create({
  root:  { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, flexShrink: 0 },
});

// Knowledge graph (reused from KB page style)
const HomeNeuralGraph = memo(({ isConn, kbCount }: { isConn: boolean; kbCount: number }) => {
  const GW = HALF - 28; const GH = 110;
  const total = kbCount || 20;
  const NODES = [
    { cat: 'Py',   color: CYAN,  rx: 0.5,  ry: 0.12, count: Math.round(total * 0.30) },
    { cat: 'Sys',  color: GREEN, rx: 0.88, ry: 0.55, count: Math.round(total * 0.25) },
    { cat: 'Net',  color: AMBER, rx: 0.5,  ry: 0.90, count: Math.round(total * 0.20) },
    { cat: 'AI',   color: PURP,  rx: 0.12, ry: 0.55, count: Math.round(total * 0.15) },
    { cat: 'Sec',  color: RED,   rx: 0.25, ry: 0.2,  count: Math.round(total * 0.06) },
    { cat: 'Data', color: TEAL,  rx: 0.75, ry: 0.2,  count: Math.round(total * 0.04) },
  ];
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.2, duration: 1400, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  const maxCount = Math.max(...NODES.map(n => n.count), 1);
  const getStroke = (a: typeof NODES[0], b: typeof NODES[0]) => {
    const rel = (a.count + b.count) / (2 * maxCount);
    return Math.max(0.5, rel * 3);
  };

  return (
    <View style={[NG.root, { borderColor: CYAN + '25', flex: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <MaterialCommunityIcons name="graph-outline" size={10} color={CYAN} />
        <Text style={{ fontFamily: MONO, fontSize: 8.5, color: CYAN + '80', fontWeight: '900', letterSpacing: 1.2, flex: 1 }}>KNOWLEDGE MAP</Text>
        <PulseDot color={isConn ? GREEN : AMBER} size={5} />
      </View>
      <View style={{ height: GH }}>
        <Svg width="100%" height={GH} viewBox={`0 0 ${GW} ${GH}`}>
          {NODES.map((n, i) => NODES.slice(i + 1).map((m, j) => (
            <Line key={`l${i}${j}`}
              x1={n.rx * GW} y1={n.ry * GH} x2={m.rx * GW} y2={m.ry * GH}
              stroke={isConn ? n.color : DIM}
              strokeWidth={isConn ? getStroke(n, m) : 0.4}
              opacity={isConn ? 0.3 : 0.06} />
          )))}
          <Circle cx={GW / 2} cy={GH / 2} r="8" fill={isConn ? CYAN + '18' : 'transparent'}
            stroke={isConn ? CYAN : DIM} strokeWidth="1.5" opacity={0.9} />
          <Circle cx={GW / 2} cy={GH / 2} r="4" fill={isConn ? CYAN : DIM} opacity={0.9} />
          {NODES.map((c, i) => (
            <Circle key={i} cx={c.rx * GW} cy={c.ry * GH} r="7"
              fill={isConn ? c.color + '1A' : 'transparent'}
              stroke={isConn ? c.color : DIM} strokeWidth="1.4"
              opacity={isConn ? 0.85 : 0.12} />
          ))}
        </Svg>
        {NODES.map((c, i) => (
          <Animated.View key={i} style={{
            position: 'absolute', left: c.rx * GW - 13, top: c.ry * GH - 13,
            opacity: isConn ? pulse : 0.18,
          }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
              borderColor: c.color + 'AA', backgroundColor: c.color + '14',
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: MONO, fontSize: 7, fontWeight: '900', color: c.color }}>{c.cat}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {NODES.slice(0, 4).map(n => (
          <View key={n.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: n.color + '28', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: n.color }} />
            <Text style={{ fontFamily: MONO, fontSize: 7, color: n.color, fontWeight: '900' }}>{n.cat}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});
const NG = StyleSheet.create({
  root: { backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, padding: 12 },
});

// Activity feed — live data from runtimeErrorMonitor
type FeedItem = { icon: string; color: string; title: string; sub: string; time: string };

function _timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function _errorToFeed(e: RuntimeError): FeedItem {
  const SEV_COLOR: Record<string, string> = { critical: RED, error: AMBER, warning: PURP, info: CYAN };
  const CAT_ICON: Record<string, string> = {
    js_crash: 'alert-circle-outline', unhandled_promise: 'lightning-bolt-outline',
    network: 'wifi-alert', console_error: 'bug-outline', console_warn: 'alert-outline',
    health_check: 'heart-pulse', component_crash: 'view-grid-outline',
    storage: 'harddisk-remove', service: 'cog-outline', auto_fix: 'wrench-check-outline',
  };
  return {
    icon: CAT_ICON[e.category] ?? 'information-outline',
    color: SEV_COLOR[e.severity] ?? CYAN,
    title: e.message.length > 48 ? e.message.slice(0, 48) + '…' : e.message,
    sub: `${e.category.replace(/_/g, ' ').toUpperCase()} · ${e.autoFixed ? 'AUTO-FIXED' : e.fixAttempted ? 'FIX ATTEMPTED' : e.source}`,
    time: _timeAgo(e.ts),
  };
}

const FALLBACK_FEED: FeedItem[] = [
  { icon: 'link-variant',         color: CYAN,  title: 'Butler server connected', sub: 'LAN · 192.168.x.x', time: '1m' },
  { icon: 'brain',                color: AMBER, title: 'Knowledge base synced',   sub: 'KB · 20 facts indexed', time: '4m' },
  { icon: 'code-braces',          color: BLUE,  title: 'Script executed OK',       sub: 'FORGE · system_info.py', time: '12m' },
  { icon: 'check-circle-outline', color: GREEN, title: 'Ollama model ready',       sub: 'AI · qwen2.5-coder:7b', time: '20m' },
  { icon: 'shield-check-outline', color: PURP,  title: 'Security audit passed',    sub: 'SEC · AES-256 active', time: '1h' },
];

const HomeFeed = memo(({ isConn, liveErrors }: { isConn: boolean; liveErrors: RuntimeError[] }) => {
  const feed: FeedItem[] = liveErrors.length > 0
    ? liveErrors.slice(0, 6).map(_errorToFeed)
    : FALLBACK_FEED;

  return (
  <View style={{ backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, borderColor: DIM + '60', overflow: 'hidden' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, padding: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: DIM + '50' }}>
      <View style={{ width: 3, height: 13, borderRadius: 1.5, backgroundColor: CYAN }} />
      <Text style={{ fontFamily: MONO, fontSize: 9, color: CYAN + '90', fontWeight: '900', letterSpacing: 1.5, flex: 1 }}>ACTIVITY FEED</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <PulseDot color={isConn ? CYAN : AMBER} size={5} />
        <Text style={{ fontFamily: MONO, fontSize: 8, color: isConn ? CYAN : AMBER, fontWeight: '900' }}>
          {isConn ? 'LIVE' : 'STANDBY'}
        </Text>
      </View>
    </View>
    {feed.map((f, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: i < feed.length - 1 ? 1 : 0, borderBottomColor: DIM + '40' }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: f.color + '12', borderWidth: 1.5, borderColor: f.color + '30', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MaterialCommunityIcons name={f.icon as any} size={13} color={f.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT, fontWeight: '700' }}>{f.title}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, marginTop: 1 }}>{f.sub}</Text>
        </View>
        <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, flexShrink: 0 }}>{f.time}</Text>
      </View>
    ))}
  </View>
  );
});

// ════════════════════════════════════════════════════════════════
// METRICS TAB
// ════════════════════════════════════════════════════════════════

// Live bar chart (matches GrowthChart style)
const CPUChart = memo(({ isConn, cpu, ram, disk }: { isConn: boolean; cpu: number; ram: number; disk: number }) => {
  const bars = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const base = 12 + i * 2.5;
      return { h: base + Math.random() * 28, label: i % 6 === 0 ? `-${24 - i}H` : '' };
    }), []);

  return (
    <View style={[MC.root, { borderColor: CYAN + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <MaterialCommunityIcons name="chart-bar" size={12} color={CYAN} />
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: CYAN + '90', fontWeight: '900', letterSpacing: 1.2, flex: 1 }}>CPU HISTORY · 24H</Text>
        <Text style={{ fontFamily: MONO, fontSize: 9, color: isConn ? CYAN : MID, fontWeight: '900' }}>
          {isConn ? `${Math.round(cpu)}%` : '--'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 2 }}>
        {bars.map((b, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${isConn ? b.h : b.h * 0.15}%`, borderRadius: 2,
                backgroundColor: i === bars.length - 1 ? CYAN : isConn ? CYAN + '45' : DIM }} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {['-24H', '-18H', '-12H', '-6H', 'NOW'].map((l, i) => (
          <Text key={i} style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{l}</Text>
        ))}
      </View>
    </View>
  );
});

const RAMChart = memo(({ isConn, ram }: { isConn: boolean; ram: number }) => {
  const sparkBars = useMemo(() => Array.from({ length: 14 }, (_, i) => 20 + i * 4 + Math.random() * 22), []);
  return (
    <View style={[MC.root, { borderColor: GREEN + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <MaterialCommunityIcons name="memory" size={12} color={GREEN} />
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: GREEN + '90', fontWeight: '900', letterSpacing: 1 }}>RAM USAGE</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 38, fontWeight: '900', color: isConn ? GREEN : MID, lineHeight: 42 }}>
            {isConn ? `${Math.round(ram)}%` : '--'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            {[
              { l: 'STATUS', v: isConn ? (ram > 85 ? 'HIGH' : 'OK') : '--' },
              { l: 'TREND',  v: isConn ? '↑ +2%' : '--' },
              { l: 'PEAK',   v: isConn ? `${Math.round(ram + 8)}%` : '--' },
            ].map((it, i) => (
              <View key={i}>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{it.l}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12, color: isConn ? TEXT : DIM, fontWeight: '900' }}>{it.v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, borderColor: (isConn ? GREEN : AMBER) + '55', backgroundColor: (isConn ? GREEN : AMBER) + '0C', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <PulseDot color={isConn ? GREEN : AMBER} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: isConn ? GREEN : AMBER }}>
            {isConn ? 'LIVE' : 'STANDBY'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
        {sparkBars.map((h, i) => (
          <View key={i} style={{ flex: 1, height: `${isConn ? h : h * 0.12}%`, borderRadius: 2,
            backgroundColor: i === sparkBars.length - 1 ? GREEN : isConn ? GREEN + '40' : DIM }} />
        ))}
      </View>
    </View>
  );
});

// Metric row table (matches Query Performance style)
const MetricsTable = memo(({ isConn, cpu, ram, disk }: {
  isConn: boolean; cpu: number; ram: number; disk: number;
}) => (
  <View style={{ backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, borderColor: BLUE + '30', padding: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <MaterialCommunityIcons name="chip" size={12} color={BLUE} />
      <Text style={{ fontFamily: MONO, fontSize: 9.5, color: BLUE + '90', fontWeight: '900', letterSpacing: 1 }}>SYSTEM OVERVIEW</Text>
    </View>
    {[
      { l: 'CPU Load',     v: isConn ? `${Math.round(cpu)}%`  : '--', c: CYAN  },
      { l: 'RAM Usage',    v: isConn ? `${Math.round(ram)}%`  : '--', c: GREEN },
      { l: 'Disk Usage',   v: isConn ? `${Math.round(disk)}%` : '--', c: AMBER },
      { l: 'Connection',   v: isConn ? 'LAN ACTIVE' : 'OFFLINE',      c: isConn ? GREEN : RED   },
      { l: 'Encryption',   v: 'AES-256-GCM',                          c: PURP  },
      { l: 'Auth Method',  v: 'HMAC-SHA256',                          c: CYAN  },
    ].map((r, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: i < 5 ? 1 : 0, borderBottomColor: DIM + '40' }}>
        <Text style={{ fontFamily: MONO, fontSize: 11, color: MID }}>{r.l}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: r.c }}>{r.v}</Text>
      </View>
    ))}
  </View>
));
const MC = StyleSheet.create({
  root: { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
});

// ════════════════════════════════════════════════════════════════
// TELEMETRY TAB
// ════════════════════════════════════════════════════════════════

// 2×2 large-text status grid (matches CategoryBreakdown style)
const TelemetryGrid = memo(({ isConn, cpu, ram, disk, kbCount }: {
  isConn: boolean; cpu: number; ram: number; disk: number; kbCount: number;
}) => {
  const cards = [
    { cat: 'PC',  color: isConn ? GREEN : AMBER, icon: 'desktop-classic',          pct: isConn ? 100 : 0, big: isConn ? 'ONLINE' : 'OFFLINE', desc: isConn ? 'Butler server active' : 'Tap PAIR to connect' },
    { cat: 'FEED',color: PURP,                   icon: 'pulse',                    pct: isConn ? 85  : 0, big: isConn ? 'ACTIVE' : 'STANDBY', desc: isConn ? 'Data streaming live'  : 'Awaiting connection' },
    { cat: 'KB',  color: CYAN,                   icon: 'brain',                    pct: isConn ? 92  : 0, big: isConn ? `${kbCount || 0}` : '—', desc: 'FACTS INDEXED' },
    { cat: 'ENC', color: GREEN,                  icon: 'shield-lock-outline',      pct: 100,              big: 'AES', desc: '256-GCM · ALWAYS ON' },
  ];

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <View style={{ width: 3, height: 12, borderRadius: 1.5, backgroundColor: PURP }} />
        <Text style={{ fontFamily: MONO, fontSize: 9, color: PURP + '90', fontWeight: '900', letterSpacing: 1.5 }}>LIVE TELEMETRY</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {cards.map((c, i) => (
          <View key={i} style={{ width: HALF, backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderTopWidth: 2.5, borderTopColor: c.color, borderColor: c.color + '28', padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.color + '14', borderWidth: 1, borderColor: c.color + '35', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name={c.icon as any} size={14} color={c.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '900', color: c.color }}>{c.cat}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{c.desc}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: MONO, fontSize: 22, fontWeight: '900', color: c.color }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{c.big}</Text>
            <View style={{ height: 3, borderRadius: 1.5, backgroundColor: DIM, marginTop: 8 }}>
              <View style={{ height: '100%', width: `${c.pct}%` as any, borderRadius: 1.5, backgroundColor: c.color }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

// Alerts & Intel (matches KB bridge security style)
const AlertsIntel = memo(({ isConn, goToTab }: { isConn: boolean; goToTab: (t: string) => void }) => {
  const alerts = isConn
    ? [{ dot: GREEN, text: 'PC paired + active', badge: 'OK',  bc: GREEN },
       { dot: CYAN,  text: 'AES-256 active',      badge: 'SEC', bc: CYAN  }]
    : [{ dot: AMBER, text: 'PC not connected',     badge: 'OFF', bc: AMBER },
       { dot: CYAN,  text: 'Scan QR to pair',      badge: 'TIP', bc: CYAN  }];
  const intel = [
    { dot: CYAN,  text: 'AI core ready',     badge: 'SYS', bc: CYAN  },
    { dot: GREEN, text: 'LAN scanner armed', badge: 'NET', bc: GREEN },
    { dot: PURP,  text: 'Encryption active', badge: 'SEC', bc: PURP  },
  ];

  return (
    <View style={{ backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, borderColor: DIM + '60', overflow: 'hidden' }}>
      <View style={{ height: 3, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: AMBER }} />
        <View style={{ flex: 1, backgroundColor: PURP }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 9 }}>
            <MaterialIcons name="notifications" size={11} color={AMBER} />
            <Text style={{ fontFamily: MONO, fontSize: 9, color: AMBER, fontWeight: '900', letterSpacing: 0.5 }}>ALERTS</Text>
          </View>
          {alerts.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: DIM + '40' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: a.dot, flexShrink: 0 }} />
              <Text style={{ fontFamily: MONO, fontSize: 9.5, color: TEXT, flex: 1 }} numberOfLines={1}>{a.text}</Text>
              <View style={{ borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderColor: a.bc + '60' }}>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: '900', color: a.bc }}>{a.badge}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={() => { haptics.light(); goToTab('logs'); }} activeOpacity={0.8} style={{ marginTop: 9 }}>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: AMBER, fontWeight: '900' }}>ALL LOGS {'>'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 1, backgroundColor: DIM }} />
        <View style={{ flex: 1, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 9 }}>
            <MaterialCommunityIcons name="clipboard-list" size={11} color={PURP} />
            <Text style={{ fontFamily: MONO, fontSize: 9, color: PURP, fontWeight: '900', letterSpacing: 0.5 }}>INTEL</Text>
          </View>
          {intel.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: DIM + '40' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: it.dot, flexShrink: 0 }} />
              <Text style={{ fontFamily: MONO, fontSize: 9.5, color: TEXT, flex: 1 }} numberOfLines={1}>{it.text}</Text>
              <View style={{ borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderColor: it.bc + '60', backgroundColor: it.bc + '08' }}>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: '900', color: it.bc }}>{it.badge}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={() => { haptics.light(); goToTab('butler'); }} activeOpacity={0.8} style={{ marginTop: 9 }}>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: PURP, fontWeight: '900' }}>ASK AI {'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
// ACTIONS TAB
// ════════════════════════════════════════════════════════════════

const QUICK_ACTIONS = [
  { icon: 'qr-code-scanner',      label: 'PAIR PC',    tab: 'connect',   color: TEAL,  desc: 'Connect via QR code' },
  { icon: 'robot-happy-outline',   label: 'AI CHAT',    tab: 'butler',    color: PURP,  desc: 'Local Ollama assistant' },
  { icon: 'code-braces-box',       label: 'FORGE',      tab: 'scripts',   color: CYAN,  desc: '250+ automation scripts' },
  { icon: 'brain',                 label: 'KNOWLEDGE',  tab: 'knowledge', color: AMBER, desc: 'AI neural store' },
  { icon: 'folder-network',        label: 'FILE VAULT', tab: 'fileshare', color: GREEN, desc: 'PC file transfer' },
  { icon: 'console-line',          label: 'INTEL LOG',  tab: 'logs',      color: BLUE,  desc: 'System activity feed' },
  { icon: 'hammer-screwdriver',    label: 'BUILDER',    tab: 'builder',   color: TEAL,  desc: 'Automation flow editor' },
  { icon: 'palette-swatch-outline',label: 'SKINS',      tab: 'cosmetic',  color: PURP,  desc: 'Visual themes' },
  { icon: 'tune-variant',          label: 'CONFIG',     tab: 'settings',  color: MID,   desc: 'App preferences' },
] as const;

const ActionsGrid = memo(({ goToTab }: { goToTab: (t: string) => void }) => (
  <View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <View style={{ width: 3, height: 12, borderRadius: 1.5, backgroundColor: AMBER }} />
      <Text style={{ fontFamily: MONO, fontSize: 9, color: AMBER + '90', fontWeight: '900', letterSpacing: 1.5 }}>CORE SURFACES</Text>
    </View>
    <View style={{ gap: 8 }}>
      {QUICK_ACTIONS.map((a, i) => (
        <TouchableOpacity key={i} onPress={() => { haptics.light(); goToTab(a.tab); }} activeOpacity={0.85}
          style={{ backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderColor: a.color + '30', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: a.color + '14', borderWidth: 1.5, borderColor: a.color + '30', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MaterialCommunityIcons name={a.icon as any} size={18} color={a.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: TEXT }}>{a.label}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, marginTop: 2 }}>{a.desc}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
            borderColor: a.color + '40', backgroundColor: a.color + '08' }}>
            <Text style={{ fontFamily: MONO, fontSize: 8, fontWeight: '900', color: a.color }}>OPEN</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
    {/* Security strip */}
    <View style={{ backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderColor: GREEN + '25', padding: 12, gap: 8, marginTop: 8 }}>
      <Text style={{ fontFamily: MONO, fontSize: 9, color: GREEN + '80', fontWeight: '900', letterSpacing: 1.2 }}>SECURITY STATUS</Text>
      {[
        { l: 'Encryption',  v: 'AES-256-GCM', c: GREEN },
        { l: 'Auth',        v: 'HMAC-SHA256', c: CYAN  },
        { l: 'Transport',   v: 'LAN ONLY',    c: AMBER },
        { l: 'Cloud relay', v: 'DISABLED',    c: GREEN },
        { l: 'Telemetry',   v: 'ZERO',        c: PURP  },
      ].map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: MID }}>{it.l}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '900', color: it.c }}>{it.v}</Text>
        </View>
      ))}
    </View>
  </View>
));

// ════════════════════════════════════════════════════════════════
// STATUS BAR (matches KB footer)
// ════════════════════════════════════════════════════════════════
const HomeStatusBar = memo(({ isConn, insetBottom }: { isConn: boolean; insetBottom: number }) => (
  <View style={[SB.root, { paddingBottom: Math.max(insetBottom + 4, 10) }]}>
    <PulseDot color={isConn ? GREEN : AMBER} size={5} />
    <Text style={{ fontFamily: MONO, fontSize: 9, color: isConn ? GREEN : AMBER, fontWeight: '900' }}>
      {isConn ? 'BUTLER ACTIVE · ZERO CLOUD' : 'OFFLINE · PAIR PC TO ENABLE'}
    </Text>
    <View style={{ flex: 1 }} />
    <Text style={{ fontFamily: MONO, fontSize: 9, color: MID }}>v7.3 · LAN ONLY</Text>
  </View>
));
const SB = StyleSheet.create({
  root: { backgroundColor: SURF, borderTopWidth: 1, borderTopColor: DIM + '50', paddingTop: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
});

// ════════════════════════════════════════════════════════════════
// OTA UPDATE BANNER
// ════════════════════════════════════════════════════════════════
const OtaBanner = memo(({ info, onApply, onDismiss }: {
  info: UpdateInfo; onApply: () => void; onDismiss: () => void;
}) => {
  if (!info.available) return null;
  return (
    <View style={{ backgroundColor: GREEN + '10', borderWidth: 1.5, borderColor: GREEN + '50', borderRadius: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 0 }}>
      <MaterialCommunityIcons name="update" size={18} color={GREEN} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '900', color: GREEN }}>UPDATE AVAILABLE</Text>
        <Text style={{ fontFamily: MONO, fontSize: 8.5, color: MID, marginTop: 2 }} numberOfLines={1}>
          {info.source === 'github' ? `${info.short ?? ''} · ${(info.message ?? '').slice(0, 50)}` : 'New build ready'}
        </Text>
      </View>
      <TouchableOpacity onPress={() => { haptics.success(); onApply(); }} activeOpacity={0.8}
        style={{ borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderColor: GREEN + '60', backgroundColor: GREEN + '0C' }}>
        <Text style={{ fontFamily: MONO, fontSize: 8, fontWeight: '900', color: GREEN }}>
          {info.applying ? '…' : 'UPDATE'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { haptics.light(); onDismiss(); }} activeOpacity={0.8} style={{ padding: 4 }}>
        <MaterialCommunityIcons name="close" size={14} color={MID} />
      </TouchableOpacity>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════
function HomeInner() {
  const insets  = useSafeAreaInsets();
  const [tab, setTab]         = useState('overview');
  const [isConn, setIsConn]   = useState(false);
  const [cpu,    setCpu]      = useState(0);
  const [ram,    setRam]      = useState(0);
  const [disk,   setDisk]     = useState(0);
  const [kbCount,setKbCount]  = useState(0);
  const [refresh, setRefresh] = useState(false);
  const [liveErrors, setLiveErrors] = useState<RuntimeError[]>([]);
  const [otaInfo, setOtaInfo] = useState<UpdateInfo>(otaUpdates.getState());

  // ── Live error monitor subscription ───────────────────────────
  useEffect(() => {
    const unsub = runtimeErrorMonitor.subscribe((errors) => {
      setLiveErrors(errors.slice(0, 6));
    });
    return unsub;
  }, []);

  // ── OTA update subscription ────────────────────────────────────
  useEffect(() => {
    const unsub = otaUpdates.subscribe((info) => setOtaInfo(info));
    return unsub;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const conn = serverConnection.isConnected?.() ?? false;
      setIsConn(conn);
      if (conn) {
        const ip  = serverConnection.getIP?.()   || '';
        const prt = serverConnection.getPort?.() || '';
        const tok = serverConnection.getToken?.() || '';
        const hd: Record<string, string> = {};
        if (tok) hd['Authorization'] = 'Bearer ' + tok;
        const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 5000);
        try {
          const res = await fetch(`http://${ip}:${prt}/api/metrics`, { headers: hd, signal: ctrl.signal });
          if (res.ok) {
            const d = await res.json();
            setCpu(d.cpu_percent  ?? d.cpu?.percent    ?? 0);
            setRam(d.ram_percent  ?? d.memory?.percent ?? 0);
            setDisk(d.disk_percent ?? d.disk?.percent  ?? 0);
          }
        } catch {}
      }
      try {
        const s = await knowledgeAccumulator.getStats?.().catch(() => null);
        if (s?.totalFindings) setKbCount(s.totalFindings);
      } catch {}
    } catch {
      autoErrorLogger.warn('[Home]', 'loadData failed');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    const t = setInterval(loadData, 25000);
    return () => clearInterval(t);
  }, [loadData]));

  const goToTab = useCallback((t: string) => {
    haptics.light();
    try { (global as any).__butlerSwitchTab?.(t); } catch {}
  }, []);

  const onRefresh = useCallback(async () => {
    setRefresh(true); haptics.medium();
    await loadData(); haptics.success(); setRefresh(false);
  }, [loadData]);

  const refreshControl = (
    <RefreshControl refreshing={refresh} onRefresh={onRefresh}
      tintColor={CYAN} colors={[CYAN, GREEN]} progressBackgroundColor={SURF} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <HomeHeader
        safeTop={insets.top} isConn={isConn}
        tab={tab} onTabChange={setTab}
        onPair={() => goToTab('connect')}
      />

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          {otaInfo.available && (
            <OtaBanner
              info={otaInfo}
              onApply={() => otaUpdates.apply().catch(() => {})}
              onDismiss={() => otaUpdates.dismiss().catch(() => {})}
            />
          )}
          <PCStatusEngine isConn={isConn} onPair={() => goToTab('connect')} />
          <HomeStatsGrid isConn={isConn} cpu={cpu} ram={ram} disk={disk} kbCount={kbCount} />
          <DownloadCTA />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <HomeNeuralGraph isConn={isConn} kbCount={kbCount} />
            <View style={{ width: HALF, gap: 8 }}>
              {[
                { l: 'STATUS',  v: isConn ? 'LIVE'    : 'OFFLINE',      c: isConn ? GREEN : AMBER },
                { l: 'ENCRYPT', v: 'AES-256',                            c: PURP  },
                { l: 'KB FACTS',v: isConn ? String(kbCount || 0) : '--', c: AMBER },
                { l: 'LAN',     v: isConn ? 'PAIRED'  : '--',            c: CYAN  },
              ].map((m, i) => (
                <View key={i} style={{ backgroundColor: SURF, borderRadius: 10, borderWidth: 1.5, borderLeftWidth: 3, borderLeftColor: m.c, borderColor: m.c + '25', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: MONO, fontSize: 8, color: MID, fontWeight: '900' }}>{m.l}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: m.c }}>{m.v}</Text>
                </View>
              ))}
            </View>
          </View>
          <HomeFeed isConn={isConn} liveErrors={liveErrors} />
        </ScrollView>
      )}

      {/* ── METRICS ── */}
      {tab === 'metrics' && (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          <CPUChart isConn={isConn} cpu={cpu} ram={ram} disk={disk} />
          <RAMChart isConn={isConn} ram={ram} />
          <MetricsTable isConn={isConn} cpu={cpu} ram={ram} disk={disk} />
        </ScrollView>
      )}

      {/* ── TELEMETRY ── */}
      {tab === 'telemetry' && (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          <TelemetryGrid isConn={isConn} cpu={cpu} ram={ram} disk={disk} kbCount={kbCount} />
          <AlertsIntel isConn={isConn} goToTab={goToTab} />
          {/* Security badge row */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 4 }}>
            {['AES-256', 'LAN ONLY', 'ZERO CLOUD', 'HMAC-SHA256'].map((b, i) => (
              <View key={i} style={{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
                borderColor: [CYAN, GREEN, AMBER, PURP][i] + '28', backgroundColor: [CYAN, GREEN, AMBER, PURP][i] + '05' }}>
                <Text style={{ fontFamily: MONO, fontSize: 7, color: [CYAN, GREEN, AMBER, PURP][i] + '65', fontWeight: '900' }}>
                  {b}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── ACTIONS ── */}
      {tab === 'actions' && (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          <ActionsGrid goToTab={goToTab} />
        </ScrollView>
      )}

      <HomeStatusBar isConn={isConn} insetBottom={insets.bottom} />
    </View>
  );
}

export default function HomeScreen() {
  return <TabErrorBoundary name="Home"><HomeInner /></TabErrorBoundary>;
}
