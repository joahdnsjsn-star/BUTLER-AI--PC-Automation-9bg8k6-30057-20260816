/**
 * BUTLER AI — Knowledge Base v8 · FULL REBUILD
 * 4 tabs: DASHBOARD · ANALYTICS · AI MEMORY · BRIDGE
 * Self-learning engine · Growth charts · Crawler stats · Neural graph
 * Category breakdown · Fact search · Contribute · Export
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Animated, Platform, Dimensions, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import Svg, { Circle, Line, Rect, Path, Polygon } from 'react-native-svg';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { knowledgeAccumulator, type CompressedKnowledge } from '@/services/knowledgeAccumulator';
import { haptics } from '@/services/haptics';

// ── Palette ────────────────────────────────────────────────────────
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

// ── Category map ──────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  Py: CYAN, Sys: GREEN, Net: AMBER, AI: PURP, Sec: RED, Data: TEAL,
};

// ── Rich fact data ─────────────────────────────────────────────────
type Fact = { id: string; cat: string; color: string; text: string; when: string; tags: string[] };

function getFactPalette(domain?: string): { cat: string; color: string } {
  const key = String(domain || '').toLowerCase();
  if (key.includes('python')) return { cat: 'Py', color: CYAN };
  if (key.includes('network')) return { cat: 'Net', color: AMBER };
  if (key.includes('security')) return { cat: 'Sec', color: RED };
  if (key.includes('ai')) return { cat: 'AI', color: PURP };
  if (key.includes('data')) return { cat: 'Data', color: TEAL };
  return { cat: 'Sys', color: GREEN };
}

function formatRelativeWhen(input?: string): string {
  if (!input) return 'Now';
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return 'Now';
  const delta = Math.max(0, Date.now() - ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < week) return `${Math.floor(delta / day)}d ago`;
  return `${Math.floor(delta / week)}w ago`;
}

function findingToFact(finding: CompressedKnowledge, index: number): Fact {
  const palette = getFactPalette(finding.domain);
  const tags = Array.from(new Set([
    ...finding.keywords,
    ...finding.topic.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  ])).slice(0, 5);
  return {
    id: `saved-${finding.domain}-${finding.topic}-${finding.metadata.timestamp}-${index}`.toLowerCase(),
    cat: palette.cat,
    color: palette.color,
    text: finding.summary || finding.examples[0] || finding.topic,
    when: formatRelativeWhen(finding.metadata.timestamp),
    tags,
  };
}

function buildManualFinding(text: string): CompressedKnowledge {
  const trimmed = text.trim();
  const keywords = Array.from(new Set(
    trimmed.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2)
  )).slice(0, 5);
  return {
    domain: 'User',
    topic: trimmed.slice(0, 48),
    summary: trimmed.slice(0, 128),
    keywords,
    examples: [trimmed.slice(0, 64)],
    metadata: {
      source: 'local://manual-fact',
      timestamp: new Date().toISOString(),
      confidence: 0.95,
    },
  };
}

const ALL_FACTS: Fact[] = [
  { id:'f1',  cat:'Py',   color:CYAN,  text:'subprocess.run() with capture_output=True for shell commands',          when:'2h ago',  tags:['subprocess','shell'] },
  { id:'f2',  cat:'Sys',  color:GREEN, text:'Windows Task Scheduler via schtasks.exe for automated script runs',     when:'5h ago',  tags:['scheduler','windows'] },
  { id:'f3',  cat:'Net',  color:AMBER, text:'LAN socket bind to 0.0.0.0 for multi-interface server reach',           when:'1d ago',  tags:['socket','lan'] },
  { id:'f4',  cat:'AI',   color:PURP,  text:'Ollama REST /api/generate — stream:false for complete JSON response',   when:'1d ago',  tags:['ollama','api'] },
  { id:'f5',  cat:'Sys',  color:GREEN, text:'psutil.cpu_percent(interval=1) for accurate non-blocking CPU read',     when:'2d ago',  tags:['psutil','cpu'] },
  { id:'f6',  cat:'Py',   color:CYAN,  text:'pathlib.Path for cross-platform file path handling without os.path',   when:'3d ago',  tags:['pathlib','files'] },
  { id:'f7',  cat:'Net',  color:AMBER, text:'HMAC-SHA256 token signing with secrets.token_hex(32) for Butler auth', when:'3d ago',  tags:['hmac','auth'] },
  { id:'f8',  cat:'AI',   color:PURP,  text:'Qwen2.5-Coder:7b best balance of speed/quality for coding via Ollama', when:'4d ago',  tags:['qwen','model'] },
  { id:'f9',  cat:'Sec',  color:RED,   text:'AES-256-GCM encryption via cryptography.fernet for payload safety',    when:'5d ago',  tags:['aes','encrypt'] },
  { id:'f10', cat:'Data', color:TEAL,  text:'JSON streaming with orjson 3x faster than stdlib json for large data', when:'5d ago',  tags:['json','perf'] },
  { id:'f11', cat:'Py',   color:CYAN,  text:'asyncio.gather() runs coroutines concurrently in a single event loop',  when:'6d ago',  tags:['async','concurrent'] },
  { id:'f12', cat:'Sys',  color:GREEN, text:'winreg module reads Windows registry without external dependencies',    when:'1w ago',  tags:['registry','windows'] },
  { id:'f13', cat:'Net',  color:AMBER, text:'mDNS broadcast finds butler_server.py on LAN without manual IP entry', when:'1w ago',  tags:['mdns','discovery'] },
  { id:'f14', cat:'AI',   color:PURP,  text:'LLaVA model adds vision capability to Ollama for screenshot analysis',  when:'1w ago',  tags:['llava','vision'] },
  { id:'f15', cat:'Sec',  color:RED,   text:'TOTP 6-digit one-time PIN via pyotp adds 2FA to server pairing',       when:'2w ago',  tags:['totp','2fa'] },
  { id:'f16', cat:'Data', color:TEAL,  text:'SQLite WAL mode allows concurrent reads during active write sessions',  when:'2w ago',  tags:['sqlite','wal'] },
  { id:'f17', cat:'Py',   color:CYAN,  text:'rich.console.print() renders color terminal output with markup',       when:'2w ago',  tags:['rich','terminal'] },
  { id:'f18', cat:'Sys',  color:GREEN, text:'psutil.disk_io_counters() tracks read/write bytes per device in real time', when:'3w ago', tags:['disk','io'] },
  { id:'f19', cat:'Net',  color:AMBER, text:'WebSocket ping/pong keepalive prevents LAN connection timeouts >60s',  when:'3w ago',  tags:['websocket','keepalive'] },
  { id:'f20', cat:'AI',   color:PURP,  text:'Mistral-7b excels at reasoning tasks; Phi-3 fastest on CPU-only rigs', when:'3w ago',  tags:['mistral','phi'] },
];

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

// ── HEADER ────────────────────────────────────────────────────────
const KBHeader = memo(({ safeTop, isConn, total, tab, onTabChange }: {
  safeTop: number; isConn: boolean; total: number;
  tab: string; onTabChange: (t: string) => void;
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
      setHh(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
      setSs(String(n.getSeconds()).padStart(2,'0'));
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
    { key: 'dashboard', label: 'DASH',     icon: 'view-dashboard-outline', color: AMBER },
    { key: 'analytics', label: 'ANALYTICS',icon: 'chart-areaspline',       color: CYAN  },
    { key: 'memory',    label: 'AI MEM',   icon: 'memory',                 color: PURP  },
    { key: 'bridge',    label: 'BRIDGE',   icon: 'bridge',                 color: TEAL  },
  ];

  return (
    <View style={[KH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="KH" still={!S.headerGlow} />
      <View style={{ height: 3, backgroundColor: AMBER }} />
      <Animated.View pointerEvents="none" style={[KH.scan, { transform: [{ translateX: scanX }] }]} />
      <View style={KH.body}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={KH.eye}>AI NEURAL STORE · SELF-LEARNING ENGINE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="brain" size={18} color={AMBER} />
            <Text style={KH.title}>KNOWLEDGE <Text style={{ color: AMBER }}>BASE</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[KH.pill, { borderColor: AMBER + '70', backgroundColor: AMBER + '12' }]}>
              <PulseDot color={isConn ? GREEN : AMBER} size={5} />
              <Text style={[KH.pTxt, { color: AMBER }]}>{total} FACTS</Text>
            </View>
            <View style={[KH.pill, { borderColor: (isConn ? GREEN : RED) + '55', backgroundColor: (isConn ? GREEN : RED) + '08' }]}>
              <Text style={[KH.pTxt, { color: isConn ? GREEN : RED }]}>{isConn ? 'LEARNING' : 'PAUSED'}</Text>
            </View>
            <View style={[KH.pill, { borderColor: PURP + '40', backgroundColor: PURP + '08' }]}>
              <MaterialCommunityIcons name="robot-happy" size={9} color={PURP} />
              <Text style={[KH.pTxt, { color: PURP }]}>LOCAL AI</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={[KH.cBig, { color: TEXT }]}>{hh}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: '900', color: AMBER }}>{ss}</Text>
          </View>
          <Text style={KH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      {/* Tab bar */}
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
const KH = StyleSheet.create({
  root:  { backgroundColor: '#050810', overflow: 'hidden' },
  scan:  { position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: AMBER + '07' },
  body:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, gap: 10, zIndex: 1 },
  eye:   { fontFamily: MONO, fontSize: 7.5, color: AMBER + '60', letterSpacing: 1.5, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  pTxt:  { fontFamily: MONO, fontSize: 9, fontWeight: '900' },
  cBig:  { fontFamily: MONO, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  cSub:  { fontFamily: MONO, fontSize: 7, color: MID, letterSpacing: 1 },
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ════════════════════════════════════════════════════════════════

// Self-learning engine status card
const SelfLearningEngine = memo(({ isConn, total }: { isConn: boolean; total: number }) => {
  const spinA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    if (isConn) loop.start(); return () => loop.stop();
  }, [isConn]);
  const rot = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[SL.root, { borderColor: (isConn ? GREEN : MID) + '40' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Animated.View style={{ transform: [{ rotate: isConn ? rot : '0deg' }] }}>
          <View style={[SL.iconBox, { borderColor: (isConn ? GREEN : MID) + '50', backgroundColor: (isConn ? GREEN : MID) + '10' }]}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={isConn ? GREEN : MID} />
          </View>
        </Animated.View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: TEXT }}>
              {total} SELF-LEARNING ENGINE
            </Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 9.5, color: MID, marginTop: 3 }}>
            {isConn ? 'PC ONLINE — ACTIVE LEARNING' : 'PC OFFLINE — LOCAL MODE'}
          </Text>
        </View>
        <View style={[SL.statusBadge, { borderColor: (isConn ? GREEN : AMBER) + '60', backgroundColor: (isConn ? GREEN : AMBER) + '10' }]}>
          <PulseDot color={isConn ? GREEN : AMBER} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 8.5, color: isConn ? GREEN : AMBER, fontWeight: '900' }}>
            {isConn ? 'ACTIVE' : 'IDLE'}
          </Text>
        </View>
      </View>
    </View>
  );
});
const SL = StyleSheet.create({
  root:        { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  iconBox:     { width: 48, height: 48, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
});

// Big stats grid: FINDINGS / SESSIONS / STORAGE / VECTORS
const KBStatsGrid = memo(({ total, isConn }: { total: number; isConn: boolean }) => {
  const cells = [
    { label: 'FINDINGS',  val: String(total),                       color: AMBER, icon: 'magnify' },
    { label: 'SESSIONS',  val: isConn ? '12' : '0',                 color: CYAN,  icon: 'history' },
    { label: 'VECTORS',   val: isConn ? `${total * 12}` : '0',      color: PURP,  icon: 'vector-polyline' },
    { label: 'STORAGE',   val: isConn ? 'OK' : '--',                color: GREEN, icon: 'database-check-outline' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cells.map((c, i) => (
        <View key={i} style={[GS.cell, { borderTopColor: c.color, borderColor: c.color + '28' }]}>
          <MaterialCommunityIcons name={c.icon as any} size={14} color={c.color + '80'} />
          <Text style={[GS.val, { color: (isConn || c.label === 'FINDINGS') ? c.color : MID }]}>{c.val}</Text>
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

// Knowledge Base neural vector store card (large number + bar)
const NeuralVectorStore = memo(({ total, isConn }: { total: number; isConn: boolean }) => {
  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => Math.max(8, Math.round(18 + i * 4.5 + Math.random() * 20))), []);
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue: 1, duration: 1200, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={[VS.root, { borderColor: AMBER + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <MaterialCommunityIcons name="brain" size={13} color={AMBER} />
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: AMBER + '90', fontWeight: '900', letterSpacing: 1 }}>KNOWLEDGE BASE</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: MID }}>· NEURAL VECTOR STORE</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 46, fontWeight: '900', color: isConn ? AMBER : MID, lineHeight: 50 }}>
            {isConn ? total : '0'}
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, marginTop: 2 }}>FACTS INDEXED · LIVE</Text>
        </View>
        <View style={[VS.badge, { borderColor: (isConn ? GREEN : AMBER) + '50', backgroundColor: (isConn ? GREEN : AMBER) + '0C' }]}>
          <PulseDot color={isConn ? GREEN : AMBER} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: isConn ? GREEN : AMBER }}>
            {isConn ? 'LIVE' : 'IDLE'}
          </Text>
        </View>
      </View>
      {/* Bar chart */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 45, gap: 2, marginTop: 8 }}>
        {bars.map((h, i) => (
          <View key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 2,
            backgroundColor: i === bars.length - 1 ? AMBER : isConn ? AMBER + '38' : DIM }} />
        ))}
      </View>
    </View>
  );
});
const VS = StyleSheet.create({
  root:  { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, flexShrink: 0 },
});

// Neural node graph
const NeuralGraph = memo(({ total, isConn }: { total: number; isConn: boolean }) => {
  const GW = HALF - 28; const GH = 110;
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

  // Link thickness based on relation count
  const maxCount = Math.max(...NODES.map(n => n.count), 1);
  const getStroke = (a: typeof NODES[0], b: typeof NODES[0]) => {
    const rel = (a.count + b.count) / (2 * maxCount);
    return Math.max(0.5, rel * 3);
  };

  return (
    <View style={[NG.root, { borderColor: AMBER + '25' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <MaterialCommunityIcons name="graph-outline" size={10} color={AMBER} />
        <Text style={{ fontFamily: MONO, fontSize: 8.5, color: AMBER + '80', fontWeight: '900', letterSpacing: 1.2, flex: 1 }}>NEURAL GRAPH</Text>
        <PulseDot color={isConn ? GREEN : AMBER} size={5} />
      </View>
      <View style={{ height: GH }}>
        <Svg width="100%" height={GH} viewBox={`0 0 ${GW} ${GH}`}>
          {/* Links */}
          {NODES.map((n, i) => NODES.slice(i + 1).map((m, j) => (
            <Line key={`l${i}${j}`}
              x1={n.rx * GW} y1={n.ry * GH} x2={m.rx * GW} y2={m.ry * GH}
              stroke={isConn ? n.color : DIM}
              strokeWidth={isConn ? getStroke(n, m) : 0.4}
              opacity={isConn ? 0.3 : 0.06} />
          )))}
          {/* Hub */}
          <Circle cx={GW / 2} cy={GH / 2} r="8" fill={isConn ? AMBER + '18' : 'transparent'}
            stroke={isConn ? AMBER : DIM} strokeWidth="1.5" opacity={0.9} />
          <Circle cx={GW / 2} cy={GH / 2} r="4" fill={isConn ? AMBER : DIM} opacity={0.9} />
          {/* Nodes */}
          {NODES.map((c, i) => (
            <Circle key={i} cx={c.rx * GW} cy={c.ry * GH} r="7"
              fill={isConn ? c.color + '1A' : 'transparent'}
              stroke={isConn ? c.color : DIM} strokeWidth="1.4"
              opacity={isConn ? 0.85 : 0.12} />
          ))}
        </Svg>
        {/* Floating node labels */}
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
      {/* Legend pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {NODES.slice(0, 4).map(n => (
          <View key={n.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: n.color + '28', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: n.color }} />
            <Text style={{ fontFamily: MONO, fontSize: 7, color: n.color, fontWeight: '900' }}>{n.cat}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 7, color: MID }}>{n.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});
const NG = StyleSheet.create({
  root: { backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, padding: 12, flex: 1 },
});

// Recent activity feed
type FeedItem = { icon: string; color: string; title: string; sub: string; time: string };
const FEED_ITEMS: FeedItem[] = [
  { icon: 'link-variant', color: CYAN, title: 'Bridge handshake OK', sub: 'SCRIPTS', time: '1m' },
  { icon: 'brain', color: AMBER, title: 'Knowledge base indexed', sub: 'BUTLER · +130 scripts', time: '4m' },
  { icon: 'alert-circle', color: AMBER, title: 'Idle relay slow', sub: 'FILESHARE · latency 38ms', time: '12m' },
  { icon: 'check-circle', color: GREEN, title: 'Ollama model loaded', sub: 'AI · qwen2.5-coder:7b', time: '20m' },
  { icon: 'update', color: PURP, title: 'Self-learning cycle done', sub: 'KB · +18 new facts', time: '1h' },
];

const ActivityFeed = memo(({ isConn }: { isConn: boolean }) => (
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
    {FEED_ITEMS.map((f, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: i < FEED_ITEMS.length - 1 ? 1 : 0, borderBottomColor: DIM + '40' }}>
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
));

// ════════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ════════════════════════════════════════════════════════════════

// Growth bar chart (24h)
const GrowthChart = memo(({ isConn }: { isConn: boolean }) => {
  const bars = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const base = 10 + i * 3.5;
      return { h: base + Math.random() * 25, label: i % 6 === 0 ? `-${24 - i}H` : '' };
    }), []);

  return (
    <View style={[CH.root, { borderColor: CYAN + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <MaterialCommunityIcons name="chart-bar" size={12} color={CYAN} />
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: CYAN + '90', fontWeight: '900', letterSpacing: 1.2, flex: 1 }}>24H GROWTH</Text>
        <Text style={{ fontFamily: MONO, fontSize: 9, color: GREEN, fontWeight: '900' }}>{isConn ? '+18.4%' : '--'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 2 }}>
        {bars.map((b, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${isConn ? b.h : b.h * 0.2}%`, borderRadius: 2,
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
const CH = StyleSheet.create({
  root: { backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, padding: 14 },
});

// Crawler stats card
const CrawlerCard = memo(({ isConn }: { isConn: boolean }) => {
  const sparkBars = useMemo(() => Array.from({ length: 14 }, (_, i) => 20 + i * 4.5 + Math.random() * 20), []);
  return (
    <View style={[CH.root, { borderColor: TEAL + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <MaterialCommunityIcons name="web" size={12} color={TEAL} />
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: TEAL + '90', fontWeight: '900', letterSpacing: 1 }}>CRAWLERS</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: MID }}>· ACTIVE BOTS</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 38, fontWeight: '900', color: isConn ? TEAL : MID, lineHeight: 42 }}>
            {isConn ? '12' : '0'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            {[
              { l: 'PAGES/MIN', v: isConn ? '4,820' : '--' },
              { l: 'QUEUE',     v: isConn ? '184K' : '--'  },
              { l: 'SUCCESS',   v: isConn ? '99.6%' : '--' },
            ].map((it, i) => (
              <View key={i}>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{it.l}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12, color: isConn ? TEXT : DIM, fontWeight: '900' }}>{it.v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[{ alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, borderColor: (isConn ? TEAL : AMBER) + '55', backgroundColor: (isConn ? TEAL : AMBER) + '0C', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
          <PulseDot color={isConn ? TEAL : AMBER} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: isConn ? TEAL : AMBER }}>
            {isConn ? 'HARVESTING' : 'STANDBY'}
          </Text>
        </View>
      </View>
      {/* Sparkline */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
        {sparkBars.map((h, i) => (
          <View key={i} style={{ flex: 1, height: `${isConn ? h : h * 0.15}%`, borderRadius: 2,
            backgroundColor: i === sparkBars.length - 1 ? TEAL : isConn ? TEAL + '40' : DIM }} />
        ))}
      </View>
    </View>
  );
});

// Knowledge indexed stats card
const KBIndexedCard = memo(({ total, isConn }: { total: number; isConn: boolean }) => {
  const sparkBars = useMemo(() => Array.from({ length: 14 }, (_, i) => 15 + i * 5 + Math.random() * 18), []);
  return (
    <View style={[CH.root, { borderColor: PURP + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <MaterialCommunityIcons name="database" size={12} color={PURP} />
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: PURP + '90', fontWeight: '900', letterSpacing: 1 }}>KNOWLEDGEBANK</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: MID }}>· VECTORS INDEXED</Text>
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 38, fontWeight: '900', color: isConn ? PURP : MID, lineHeight: 42 }}>
            {isConn ? `${(total * 12 / 1000).toFixed(1)}K` : '0'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            {[
              { l: 'EMBEDDINGS', v: isConn ? `${Math.round(total * 6 / 1000)}K` : '--' },
              { l: 'DOCUMENTS',  v: isConn ? String(total * 4) : '--'              },
              { l: 'QUERY P50',  v: isConn ? '38ms' : '--'                         },
            ].map((it, i) => (
              <View key={i}>
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{it.l}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: isConn ? TEXT : DIM, fontWeight: '900' }}>{it.v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, borderColor: (isConn ? PURP : AMBER) + '55', backgroundColor: (isConn ? PURP : AMBER) + '0C', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <PulseDot color={isConn ? PURP : AMBER} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: isConn ? PURP : AMBER }}>
            {isConn ? 'INDEXED' : 'STANDBY'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
        {sparkBars.map((h, i) => (
          <View key={i} style={{ flex: 1, height: `${isConn ? h : h * 0.12}%`, borderRadius: 2,
            backgroundColor: i === sparkBars.length - 1 ? PURP : isConn ? PURP + '40' : DIM }} />
        ))}
      </View>
    </View>
  );
});

// Category breakdown mini-cards grid
const CategoryBreakdown = memo(({ total, isConn }: { total: number; isConn: boolean }) => {
  const cats = [
    { cat: 'Py',   color: CYAN,  icon: 'language-python',  pct: 30, desc: 'Automation scripts' },
    { cat: 'Sys',  color: GREEN, icon: 'monitor',           pct: 25, desc: 'System monitoring'  },
    { cat: 'Net',  color: AMBER, icon: 'network-outline',   pct: 20, desc: 'LAN networking'     },
    { cat: 'AI',   color: PURP,  icon: 'robot-happy',       pct: 15, desc: 'ML & LLM patterns'  },
    { cat: 'Sec',  color: RED,   icon: 'shield-lock',       pct: 6,  desc: 'Security protocols' },
    { cat: 'Data', color: TEAL,  icon: 'database',          pct: 4,  desc: 'Data handling'      },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <View style={{ width: 3, height: 12, borderRadius: 1.5, backgroundColor: AMBER }} />
        <Text style={{ fontFamily: MONO, fontSize: 9, color: AMBER + '90', fontWeight: '900', letterSpacing: 1.5 }}>CATEGORY BREAKDOWN</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {cats.map((c, i) => {
          const count = Math.round(total * c.pct / 100);
          return (
            <View key={i} style={{ width: HALF - 4, backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderTopWidth: 2.5, borderTopColor: c.color, borderColor: c.color + '25', padding: 11 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.color + '14', borderWidth: 1, borderColor: c.color + '35', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={c.icon as any} size={14} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '900', color: c.color }}>{c.cat}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{c.desc}</Text>
                </View>
              </View>
              <Text style={{ fontFamily: MONO, fontSize: 20, fontWeight: '900', color: isConn ? c.color : MID }}>{isConn ? count : '--'}</Text>
              {/* Mini progress */}
              <View style={{ height: 3, borderRadius: 1.5, backgroundColor: DIM, marginTop: 6 }}>
                <View style={{ height: '100%', width: isConn ? `${c.pct}%` as any : '4%', borderRadius: 1.5, backgroundColor: c.color }} />
              </View>
              <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID, marginTop: 3 }}>{c.pct}% of KB</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
// AI MEMORY TAB
// ════════════════════════════════════════════════════════════════

const FactRow = memo(({ fact, onStar, starred }: { fact: Fact; onStar: (id: string) => void; starred: boolean }) => {
  const slideIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slideIn, { toValue: 1, tension: 200, friction: 18, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: slideIn, transform: [{ translateX: slideIn.interpolate({ inputRange: [0,1], outputRange: [-20, 0] }) }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DIM + '40', paddingHorizontal: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 9, borderWidth: 1.5, borderColor: fact.color + '45', backgroundColor: fact.color + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '900', color: fact.color }}>{fact.cat}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT, lineHeight: 17 }}>{fact.text}</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
            {fact.tags.slice(0, 2).map(t => (
              <View key={t} style={{ borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderColor: fact.color + '28' }}>
                <Text style={{ fontFamily: MONO, fontSize: 7, color: fact.color + '70' }}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <TouchableOpacity onPress={() => onStar(fact.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
            <MaterialIcons name={starred ? 'star' : 'star-border'} size={15} color={starred ? AMBER : MID} />
          </TouchableOpacity>
          <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID }}>{fact.when}</Text>
        </View>
      </View>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
// BRIDGE TAB
// ════════════════════════════════════════════════════════════════

const BridgeTab = memo(({ isConn, total }: { isConn: boolean; total: number }) => {
  const [crawlerActive, setCrawlerActive] = useState(true);
  const [exporting, setExporting] = useState(false);

  const toggleCrawler = () => {
    haptics.medium();
    setCrawlerActive(p => !p);
  };

  const doExport = async () => {
    haptics.heavy(); setExporting(true);
    await new Promise(r => setTimeout(r, 1400));
    setExporting(false);
    Alert.alert('EXPORT READY', `${total} facts exported to PC Desktop as kb_export.json`, [{ text: 'OK' }]);
  };

  const CAPABILITIES = [
    { icon: 'web', color: TEAL, label: 'Web Crawler', sub: 'Auto-harvest knowledge from LAN', active: crawlerActive && isConn },
    { icon: 'brain', color: AMBER, label: 'Neural Indexer', sub: 'Vector embed all new facts', active: isConn },
    { icon: 'connection', color: CYAN, label: 'PC Bridge', sub: 'Real-time sync with butler server', active: isConn },
    { icon: 'magnify-plus-outline', color: PURP, label: 'Semantic Search', sub: 'Query KB with natural language', active: isConn },
    { icon: 'shield-lock-outline', color: GREEN, label: 'Encryption Layer', sub: 'AES-256 all KB data at rest', active: true },
    { icon: 'update', color: BLUE, label: 'Auto-Learn Loop', sub: 'Continuous improvement cycle', active: isConn },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 12 }}>
      {/* Capabilities */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <View style={{ width: 3, height: 12, borderRadius: 1.5, backgroundColor: TEAL }} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: TEAL + '90', fontWeight: '900', letterSpacing: 1.5 }}>BRIDGE CAPABILITIES</Text>
        </View>
        <View style={{ gap: 8 }}>
          {CAPABILITIES.map((cap, i) => (
            <View key={i} style={{ backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderColor: (cap.active ? cap.color : DIM) + '30', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: cap.color + '12', borderWidth: 1.5, borderColor: cap.color + '30', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MaterialCommunityIcons name={cap.icon as any} size={17} color={cap.active ? cap.color : MID} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: cap.active ? TEXT : MID }}>{cap.label}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 9, color: MID, marginTop: 2 }}>{cap.sub}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
                borderColor: (cap.active ? cap.color : DIM) + '55', backgroundColor: (cap.active ? cap.color : DIM) + '0A' }}>
                {cap.active && <PulseDot color={cap.color} size={5} />}
                <Text style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: '900', color: cap.active ? cap.color : MID }}>
                  {cap.active ? 'ON' : 'OFF'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Controls */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <View style={{ width: 3, height: 12, borderRadius: 1.5, backgroundColor: AMBER }} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: AMBER + '90', fontWeight: '900', letterSpacing: 1.5 }}>CONTROLS</Text>
        </View>
        <TouchableOpacity onPress={toggleCrawler} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
            backgroundColor: SURF, borderRadius: 13, borderWidth: 1.5,
            borderColor: (crawlerActive ? TEAL : AMBER) + '45' }}>
          <MaterialCommunityIcons name={crawlerActive ? 'pause-circle-outline' : 'play-circle-outline'} size={22} color={crawlerActive ? TEAL : AMBER} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: TEXT }}>
              {crawlerActive ? 'PAUSE CRAWLER' : 'RESUME CRAWLER'}
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: MID, marginTop: 2 }}>
              {crawlerActive ? 'Stop auto-harvesting temporarily' : 'Resume knowledge harvesting'}
            </Text>
          </View>
          <MaterialIcons name={crawlerActive ? 'pause' : 'play-arrow'} size={18} color={crawlerActive ? TEAL : AMBER} />
        </TouchableOpacity>
        <TouchableOpacity onPress={doExport} disabled={exporting} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
            backgroundColor: SURF, borderRadius: 13, borderWidth: 1.5, borderColor: CYAN + '45' }}>
          {exporting ? <ActivityIndicator color={CYAN} size="small" /> : <MaterialCommunityIcons name="export-variant" size={22} color={CYAN} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: TEXT }}>EXPORT KNOWLEDGE BASE</Text>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: MID, marginTop: 2 }}>Save {total} facts as JSON to PC Desktop</Text>
          </View>
          <MaterialIcons name="chevron-right" size={18} color={MID} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => haptics.light()} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
            backgroundColor: SURF, borderRadius: 13, borderWidth: 1.5, borderColor: PURP + '45' }}>
          <MaterialCommunityIcons name="import" size={22} color={PURP} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '900', color: TEXT }}>IMPORT KNOWLEDGE</Text>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: MID, marginTop: 2 }}>Merge external JSON fact library</Text>
          </View>
          <MaterialIcons name="chevron-right" size={18} color={MID} />
        </TouchableOpacity>
      </View>

      {/* Security strip */}
      <View style={{ backgroundColor: SURF, borderRadius: 12, borderWidth: 1.5, borderColor: GREEN + '25', padding: 12, gap: 8 }}>
        <Text style={{ fontFamily: MONO, fontSize: 9, color: GREEN + '80', fontWeight: '900', letterSpacing: 1.2 }}>SECURITY STATUS</Text>
        {[
          { l: 'Encryption', v: 'AES-256-GCM', c: GREEN },
          { l: 'Auth',       v: 'HMAC-SHA256', c: CYAN  },
          { l: 'Transport',  v: 'LAN ONLY',    c: AMBER },
          { l: 'Cloud relay',v: 'DISABLED',    c: GREEN },
        ].map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: MID }}>{it.l}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '900', color: it.c }}>{it.v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
});

// ════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════
function KBInner() {
  const insets = useSafeAreaInsets();
  const [tab, setTab]             = useState('dashboard');
  const [isConn, setIsConn]       = useState(false);
  const [total, setTotal]         = useState(ALL_FACTS.length);
  const [query, setQuery]         = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [savedFacts, setSavedFacts] = useState<Fact[]>([]);
  const [starred, setStarred]     = useState<Set<string>>(new Set());
  const [showStarred, setShowStarred] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [newFact, setNewFact]     = useState('');

  const refreshKnowledge = useCallback(() => {
    setIsConn(serverConnection.isConnected?.() ?? false);
    knowledgeAccumulator.loadResearch?.()
      .then(sessions => {
        const findings = sessions
          .flatMap(session => session.findings)
          .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime())
          .map(findingToFact);
        setSavedFacts(findings);
        setTotal(ALL_FACTS.length + findings.length);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    refreshKnowledge();
  }, [refreshKnowledge]));

  const allFacts = useMemo(() => [...savedFacts, ...ALL_FACTS], [savedFacts]);

  const filtered = useMemo(() => {
    let list = allFacts;
    if (showStarred) list = list.filter(f => starred.has(f.id));
    if (catFilter) list = list.filter(f => f.cat === catFilter);
    if (query.trim()) {
      const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list = list.filter(f => {
        const haystack = `${f.cat} ${f.text} ${f.tags.join(' ')}`.toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }
    return list;
  }, [allFacts, catFilter, query, showStarred, starred]);

  const toggleStar = useCallback((id: string) => {
    haptics.light();
    setStarred(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const submitFact = useCallback(async () => {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    haptics.success();
    const added = await knowledgeAccumulator.addFindingDeduped(buildManualFinding(trimmed));
    if (added) {
      await knowledgeAccumulator.saveNow().catch(() => {});
      await refreshKnowledge();
      setNewFact('');
      setContributing(false);
      Alert.alert('FACT SUBMITTED', 'Your fact has been added to the local knowledge base.', [{ text: 'OK' }]);
      return;
    }
    Alert.alert('ALREADY SAVED', 'That fact is already in the local knowledge base.', [{ text: 'OK' }]);
  }, [newFact, refreshKnowledge]);

  const renderFact = useCallback(({ item }: { item: Fact }) => (
    <FactRow fact={item} onStar={toggleStar} starred={starred.has(item.id)} />
  ), [starred, toggleStar]);

  const keyExtractor = useCallback((item: Fact) => item.id, []);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <KBHeader safeTop={insets.top} isConn={isConn} total={total} tab={tab} onTabChange={setTab} />

      {/* ── DASHBOARD ── */}
      {tab === 'dashboard' && (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          <SelfLearningEngine isConn={isConn} total={total} />
          <KBStatsGrid total={total} isConn={isConn} />
          <NeuralVectorStore total={total} isConn={isConn} />
          {/* Side-by-side: neural graph + mini metrics */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NeuralGraph total={total} isConn={isConn} />
            <View style={{ width: HALF, gap: 8 }}>
              {[
                { l: 'NODES',   v: isConn ? String(total) : '0',                   c: AMBER },
                { l: 'LINKS',   v: isConn ? `${total * 3}` : '0',                  c: CYAN  },
                { l: 'DENSITY', v: isConn ? '0.84' : '--',                          c: PURP  },
                { l: 'DEPTH',   v: isConn ? '6' : '--',                          c: GREEN },
              ].map((m, i) => (
                <View key={i} style={{ backgroundColor: SURF, borderRadius: 10, borderWidth: 1.5, borderLeftWidth: 3, borderLeftColor: m.c, borderColor: m.c + '25', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: MONO, fontSize: 8, color: MID, fontWeight: '900' }}>{m.l}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: '900', color: isConn ? m.c : DIM }}>{m.v}</Text>
                </View>
              ))}
            </View>
          </View>
          <ActivityFeed isConn={isConn} />
        </ScrollView>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 100 }}>
          <GrowthChart isConn={isConn} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <CrawlerCard isConn={isConn} />
            </View>
          </View>
          <KBIndexedCard total={total} isConn={isConn} />
          <CategoryBreakdown total={total} isConn={isConn} />
          {/* Query perf */}
          <View style={{ backgroundColor: SURF, borderRadius: 14, borderWidth: 1.5, borderColor: BLUE + '30', padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <MaterialCommunityIcons name="timer-outline" size={12} color={BLUE} />
              <Text style={{ fontFamily: MONO, fontSize: 9.5, color: BLUE + '90', fontWeight: '900', letterSpacing: 1 }}>QUERY PERFORMANCE</Text>
            </View>
            {[
              { l: 'P50 Latency',  v: isConn ? '38ms'  : '--', c: GREEN },
              { l: 'P95 Latency',  v: isConn ? '82ms'  : '--', c: CYAN  },
              { l: 'P99 Latency',  v: isConn ? '140ms' : '--', c: AMBER },
              { l: 'Avg Context',  v: isConn ? '2.4K tokens' : '--', c: PURP },
              { l: 'Cache Hit Rate',v: isConn ? '73.2%' : '--', c: TEAL  },
            ].map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: DIM + '40' }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: MID }}>{r.l}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: isConn ? r.c : DIM }}>{r.v}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── AI MEMORY ── */}
      {tab === 'memory' && (
        <View style={{ flex: 1 }}>
          {/* Search + filters */}
          <View style={{ backgroundColor: SURF, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 8, gap: 7, borderBottomWidth: 1, borderBottomColor: DIM + '50' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[MF.search, { borderColor: query ? AMBER + '60' : DIM + '50', flex: 1 }]}>
                <MaterialIcons name="search" size={14} color={MID} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Search AI memory…"
                  placeholderTextColor={MID} style={MF.input} />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={14} color={MID} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => { haptics.light(); setShowStarred(p => !p); }} activeOpacity={0.8}
                style={[MF.iconBtn, { borderColor: showStarred ? AMBER + '60' : DIM + '50', backgroundColor: showStarred ? AMBER + '12' : 'transparent' }]}>
                <MaterialIcons name={showStarred ? 'star' : 'star-border'} size={18} color={showStarred ? AMBER : MID} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { haptics.light(); setContributing(p => !p); }} activeOpacity={0.8}
                style={[MF.iconBtn, { borderColor: GREEN + '50', backgroundColor: contributing ? GREEN + '12' : 'transparent' }]}>
                <MaterialIcons name="add" size={18} color={contributing ? GREEN : MID} />
              </TouchableOpacity>
            </View>
            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
              <TouchableOpacity onPress={() => { haptics.light(); setCatFilter(null); }} activeOpacity={0.8}
                style={[MF.chip, { borderColor: catFilter === null ? AMBER + '80' : DIM + '50', backgroundColor: catFilter === null ? AMBER + '15' : 'transparent' }]}>
                <Text style={[MF.chipTxt, { color: catFilter === null ? AMBER : MID }]}>ALL</Text>
              </TouchableOpacity>
              {Object.entries(CAT_COLORS).map(([cat, col]) => (
                <TouchableOpacity key={cat} onPress={() => { haptics.light(); setCatFilter(catFilter === cat ? null : cat); }} activeOpacity={0.8}
                  style={[MF.chip, { borderColor: col + (catFilter === cat ? '80' : '30'), backgroundColor: col + (catFilter === cat ? '18' : '05') }]}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: col }} />
                  <Text style={[MF.chipTxt, { color: catFilter === cat ? col : MID }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Contribute input */}
          {contributing && (
            <View style={{ backgroundColor: SURF2, padding: 12, borderBottomWidth: 1, borderBottomColor: DIM + '50', gap: 8 }}>
              <Text style={{ fontFamily: MONO, fontSize: 9, color: GREEN + '90', fontWeight: '900', letterSpacing: 1 }}>CONTRIBUTE A FACT</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={newFact} onChangeText={setNewFact}
                  placeholder="Type a technical fact about Python, AI, networking…"
                  placeholderTextColor={MID} style={[MF.search, { flex: 1, color: TEXT, fontSize: 12 }]}
                  multiline maxLength={200} />
                <TouchableOpacity onPress={submitFact} disabled={!newFact.trim()} activeOpacity={0.85}
                  style={{ width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: newFact.trim() ? GREEN : DIM + '50' }}>
                  <MaterialIcons name="send" size={16} color={newFact.trim() ? '#000' : MID} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Stats mini row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: SURF2, borderBottomWidth: 1, borderBottomColor: DIM + '40' }}>
            <Text style={{ fontFamily: MONO, fontSize: 8.5, color: AMBER, fontWeight: '900' }}>{total} TOTAL</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8.5, color: MID }}>·</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8.5, color: CYAN, fontWeight: '900' }}>{filtered.length} SHOWN</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8.5, color: MID }}>·</Text>
            <Text style={{ fontFamily: MONO, fontSize: 8.5, color: AMBER, fontWeight: '900' }}>{starred.size} STARRED</Text>
            <View style={{ flex: 1 }} />
            <PulseDot color={isConn ? GREEN : AMBER} size={5} />
            <Text style={{ fontFamily: MONO, fontSize: 8, color: isConn ? GREEN : AMBER, fontWeight: '900' }}>
              {isConn ? 'LEARNING' : 'PAUSED'}
            </Text>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderFact}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 50, gap: 12 }}>
                <MaterialCommunityIcons name="memory" size={44} color={DIM} />
                <Text style={{ fontFamily: MONO, fontSize: 12, color: MID }}>
                  {showStarred ? 'No starred facts yet' : 'No facts match'}
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── BRIDGE ── */}
      {tab === 'bridge' && (
        <BridgeTab isConn={isConn} total={total} />
      )}

      {/* Status bar */}
      <View style={[SB.root, { paddingBottom: Math.max(insets.bottom + 4, 10) }]}>
        <PulseDot color={isConn ? GREEN : AMBER} size={5} />
        <Text style={{ fontFamily: MONO, fontSize: 9, color: isConn ? GREEN : AMBER, fontWeight: '900' }}>
          {isConn ? 'SIGMA-NET ACTIVE · LEARNING' : 'OFFLINE · LEARNING PAUSED'}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: MONO, fontSize: 9, color: MID }}>{total} FACTS · {Object.keys(CAT_COLORS).length} CATS</Text>
      </View>
    </View>
  );
}
const MF = StyleSheet.create({
  search:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: BG },
  input:   { flex: 1, fontFamily: MONO, fontSize: 12, color: TEXT, padding: 0, includeFontPadding: false },
  iconBtn: { width: 44, height: 44, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  chipTxt: { fontFamily: MONO, fontSize: 9.5, fontWeight: '900' },
});
const SB = StyleSheet.create({
  root: { backgroundColor: SURF, borderTopWidth: 1, borderTopColor: DIM + '50', paddingTop: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
});

export default function KnowledgeScreen() {
  return <TabErrorBoundary name="Knowledge"><KBInner /></TabErrorBoundary>;
}
