/**
 * AIBrainMasterpieceCard.tsx v2 — Compact, full-width, left-to-right layout
 * Memory Brain · Personal Memory · URL Crawler · Level system
 * Uses all horizontal space — no wasted margins
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
  Platform, Dimensions, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { personalMemory, PersonalFact, MemoryEvent } from '@/services/personalMemory';
import { neuralTripwire, TripwireState } from '@/services/neuralTripwire';
import { knowledgeAccumulator } from '@/services/knowledgeAccumulator';
import { serverConnection } from '@/services/serverConnection';
import { sigmaNetCrawler } from '@/services/serverCrawler';
import { haptics } from '@/services/haptics';

const { width: SW } = Dimensions.get('window');
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

const C = {
  bg:      '#050810',
  card:    '#0B0F17',
  surf:    '#0B0F17',
  cyan:    '#38D9E8',
  green:   '#2FE38A',
  amber:   '#FFB43D',
  purple:  '#A468FF',
  sigma:   '#A468FF',
  red:     '#FF4D5E',
  teal:    '#38D9E8',
  blue:    '#4A9EFF',
  pink:    '#FF5FA8',
  text:    '#4A9EFF',
  mid:     '#4A9EFF',
  dim:     '#4A9EFF',
  yellow:  '#FFC94A',
  border:  'rgba(0,229,255,0.14)',
};

const ACCENT_COLORS = ['#4A9EFF','#38D9E8','#2FE38A','#38D9E8','#4A9EFF','#A468FF','#A468FF','#FFB43D','#FF5FA8','#FFC94A','#38D9E8'];

function getLevel(articles: number) {
  const thresholds = [0, 10, 25, 50, 100, 200, 400, 700, 1000, 2000, 5000];
  const titles = ['NEWBORN','LEARNER','STUDENT','SCHOLAR','EXPERT','MASTER','SAGE','ORACLE','SENTINEL','NEXUS','OMEGA'];
  let level = 0;
  for (let i = 0; i < thresholds.length - 1; i++) { if (articles >= thresholds[i]) level = i; }
  const xp = articles - thresholds[level];
  const nextXp = (thresholds[level + 1] ?? thresholds[thresholds.length - 1]) - thresholds[level];
  return { level: level + 1, title: titles[level], xp: Math.max(0, xp), nextXp: Math.max(1, nextXp) };
}

// ── Tiny Pulse Dot ────────────────────────────────────────────────
function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const a = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.15, duration: 700, useNativeDriver: true }),
    ]));
    l.start(); return () => l.stop();
  }, []);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />;
}

// ── Neural Brain canvas — full width ─────────────────────────────
const NODES = [
  { x: 50, y: 50, col: C.cyan   }, { x: 22, y: 32, col: C.purple },
  { x: 78, y: 32, col: C.green  }, { x: 12, y: 58, col: C.amber  },
  { x: 88, y: 58, col: C.pink   }, { x: 28, y: 73, col: C.teal   },
  { x: 72, y: 73, col: C.blue   }, { x: 50, y: 16, col: C.sigma  },
  { x: 36, y: 46, col: C.cyan   }, { x: 64, y: 46, col: C.green  },
  { x: 18, y: 80, col: C.amber  }, { x: 82, y: 80, col: C.purple },
  { x: 50, y: 86, col: C.teal   },
];
const EDGES = [
  [0,1],[0,2],[0,8],[0,9],[1,3],[1,7],[2,4],[2,7],[3,5],[4,6],
  [5,12],[6,12],[7,0],[8,1],[9,2],[10,5],[11,6],[8,9],[10,12],[11,12],
];

function NeuralBrain({ kbArticles, isConnected, sessions }: {
  kbArticles: number; isConnected: boolean; sessions: number;
}) {
  const CW = SW - 32; // full width minus outer padding
  const CH = 148;
  const nodeAnims = useRef(NODES.map(() => new Animated.Value(0.3 + Math.random() * 0.5))).current;
  const packetAnims = useRef(EDGES.slice(0, 8).map(() => new Animated.Value(0))).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  const nodePx = useMemo(() => NODES.map(n => ({
    x: Math.round(n.x / 100 * CW), y: Math.round(n.y / 100 * CH), col: n.col,
  })), [CW]);

  const edgePx = useMemo(() => EDGES.map(([a, b]) => {
    const na = nodePx[a]; const nb = nodePx[b];
    const dx = nb.x - na.x; const dy = nb.y - na.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    return { mx:(na.x+nb.x)/2, my:(na.y+nb.y)/2, len, angle:Math.atan2(dy,dx)*180/Math.PI, ax:na.x, ay:na.y, bx:nb.x, by:nb.y, colA:na.col };
  }), [nodePx]);

  useEffect(() => {
    const pulses = nodeAnims.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 130),
        Animated.timing(a, { toValue: 1, duration: 800 + i * 100, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.15, duration: 800 + i * 100, useNativeDriver: true }),
      ]))
    );
    const packets = packetAnims.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 420),
        Animated.timing(a, { toValue: 1, duration: 1200 + i * 160, useNativeDriver: false }),
        Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: false }),
        Animated.delay(700),
      ]))
    );
    const scan = Animated.loop(Animated.timing(scanAnim, { toValue: 1, duration: 3800, useNativeDriver: false }));
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0.2, duration: 1400, useNativeDriver: false }),
    ]));
    pulses.forEach(p => p.start());
    packets.forEach(p => p.start());
    scan.start(); glow.start();
    return () => { pulses.forEach(p => p.stop()); packets.forEach(p => p.stop()); scan.stop(); glow.stop(); };
  }, []);

  const scanX = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [-CW * 0.15, CW * 1.15] });
  const cc = isConnected ? C.green : C.amber;

  return (
    <View style={[nb.canvas, { height: CH, width: CW }]}>
      {/* Scan beam */}
      <Animated.View pointerEvents="none"
        style={[nb.scan, { transform: [{ translateX: scanX }], width: CW * 0.12 }]} />
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(p => (
        <View key={p} pointerEvents="none"
          style={{ position:'absolute', left:0, right:0, top: p * CH, height: 1, backgroundColor: C.cyan + '07' }} />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map(p => (
        <View key={p} pointerEvents="none"
          style={{ position:'absolute', top:0, bottom:0, left: p * CW, width: 1, backgroundColor: C.cyan + '05' }} />
      ))}
      {/* Edges */}
      {edgePx.map((e, i) => (
        <Animated.View key={`e${i}`} pointerEvents="none" style={[nb.edge, {
          left: e.mx - e.len / 2, top: e.my - 0.75,
          width: Math.round(e.len),
          transform: [{ rotate: `${e.angle}deg` }],
          backgroundColor: e.colA + '28',
          opacity: nodeAnims[EDGES[i][0]].interpolate({ inputRange: [0.15, 1], outputRange: [0.15, 0.65] }),
        }]} />
      ))}
      {/* Packets */}
      {edgePx.slice(0, 8).map((e, i) => (
        <Animated.View key={`p${i}`} pointerEvents="none" style={[nb.packet, {
          left: packetAnims[i].interpolate({ inputRange: [0, 1], outputRange: [e.ax - 4, e.bx - 4] }),
          top:  packetAnims[i].interpolate({ inputRange: [0, 1], outputRange: [e.ay - 4, e.by - 4] }),
          backgroundColor: e.colA,
          opacity: packetAnims[i].interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        }]} />
      ))}
      {/* Nodes */}
      {nodePx.map((n, i) => (
        <Animated.View key={`n${i}`} pointerEvents="none"
          style={[nb.node, { left: n.x - 5, top: n.y - 5, backgroundColor: n.col, opacity: nodeAnims[i] }]} />
      ))}
      {/* Hub */}
      <Animated.View pointerEvents="none"
        style={[nb.hub, { left: nodePx[0].x - 11, top: nodePx[0].y - 11, borderColor: C.cyan, opacity: glowAnim }]}>
        <MaterialCommunityIcons name="brain" size={11} color={C.cyan} />
      </Animated.View>
      {/* HUD corners */}
      {[
        { top: 4, left: 4, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
        { top: 4, right: 4, borderTopWidth: 1.5, borderRightWidth: 1.5 },
        { bottom: 4, left: 4, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
        { bottom: 4, right: 4, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
      ].map((s, i) => (
        <View key={i} pointerEvents="none"
          style={[{ position:'absolute', width:10, height:10, borderColor:C.cyan+'50' }, s as any]} />
      ))}
      {/* Status badges — top-right inline */}
      <View pointerEvents="none" style={nb.overlay}>
        <View style={[nb.pill, { borderColor: cc + '55', backgroundColor: cc + '0F' }]}>
          <PulseDot color={cc} size={4} />
          <Text style={[nb.pillTxt, { color: cc }]}>{isConnected ? 'LIVE' : 'LOCAL'}</Text>
        </View>
        <View style={[nb.pill, { borderColor: C.purple + '50', backgroundColor: C.purple + '0C' }]}>
          <Text style={[nb.pillTxt, { color: C.purple }]}>{kbArticles} VEC</Text>
        </View>
        <View style={[nb.pill, { borderColor: C.amber + '45', backgroundColor: C.amber + '0A' }]}>
          <Text style={[nb.pillTxt, { color: C.amber }]}>{sessions} SES</Text>
        </View>
      </View>
    </View>
  );
}

const nb = StyleSheet.create({
  canvas:  { position:'relative', backgroundColor:'#050810', borderRadius:10, overflow:'hidden', marginBottom:10 },
  scan:    { position:'absolute', top:0, bottom:0, backgroundColor:C.cyan+'09', transform:[{skewX:'-8deg'}] },
  edge:    { position:'absolute', height:1.5, borderRadius:1 },
  packet:  { position:'absolute', width:8, height:8, borderRadius:4 },
  node:    { position:'absolute', width:10, height:10, borderRadius:5 },
  hub:     { position:'absolute', width:22, height:22, borderRadius:11, borderWidth:1.5, alignItems:'center', justifyContent:'center', backgroundColor:C.cyan+'18' },
  overlay: { position:'absolute', top:6, right:6, flexDirection:'row', gap:4 },
  pill:    { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1, borderRadius:6, paddingHorizontal:6, paddingVertical:2.5 },
  pillTxt: { fontFamily:MONO, fontSize:7.5, fontWeight:'900', letterSpacing:0.3 },
});

// ── Level XP Bar — compact horizontal ────────────────────────────
function LevelBar({ articles }: { articles: number }) {
  const { level, title, xp, nextXp } = getLevel(articles);
  const pct = Math.min(100, Math.round((xp / nextXp) * 100));
  const barA = useRef(new Animated.Value(0)).current;
  const shimA = useRef(new Animated.Value(0)).current;
  const col = ACCENT_COLORS[Math.min(level - 1, ACCENT_COLORS.length - 1)];

  useEffect(() => {
    Animated.timing(barA, { toValue: pct / 100, duration: 1100, useNativeDriver: false }).start();
    const sh = Animated.loop(Animated.sequence([
      Animated.timing(shimA, { toValue: 1, duration: 1800, useNativeDriver: false }),
      Animated.timing(shimA, { toValue: 0, duration: 0, useNativeDriver: false }),
      Animated.delay(3200),
    ]));
    sh.start(); return () => sh.stop();
  }, [pct]);

  const shimLeft = shimA.interpolate({ inputRange: [0, 1], outputRange: ['-25%', '125%'] });

  return (
    <View style={{ marginBottom: 10 }}>
      {/* Label row */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
        <View style={[lvl.badge, { borderColor: col + '70', backgroundColor: col + '18' }]}>
          <Text style={[lvl.badgeTxt, { color: col }]}>LVL {level}</Text>
        </View>
        <Text style={[lvl.title, { color: col }]}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={lvl.xpTxt}>{xp}/{nextXp} XP</Text>
        <Text style={[lvl.pctTxt, { color: col }]}>{pct}%</Text>
      </View>
      {/* Bar */}
      <View style={lvl.track}>
        <Animated.View style={[lvl.fill, {
          width: barA.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }) as any,
          backgroundColor: col, overflow:'hidden',
        }]}>
          <Animated.View style={[lvl.shim, { left: shimLeft }]} />
        </Animated.View>
        {[25, 50, 75].map(p => (
          <View key={p} style={{ position:'absolute', top:0, bottom:0, width:1, backgroundColor:'rgba(0,0,0,0.25)', left:`${p}%` as any }} />
        ))}
      </View>
      <Text style={lvl.hint}>{nextXp - xp} XP to {getLevel(articles + nextXp - xp).title}</Text>
    </View>
  );
}
const lvl = StyleSheet.create({
  badge:   { borderWidth:1.5, borderRadius:7, paddingHorizontal:9, paddingVertical:3 },
  badgeTxt:{ fontFamily:MONO, fontSize:11, fontWeight:'900', letterSpacing:0.5 },
  title:   { fontFamily:MONO, fontSize:13, fontWeight:'900' },
  xpTxt:   { fontFamily:MONO, fontSize:9, color:C.mid },
  pctTxt:  { fontFamily:MONO, fontSize:10, fontWeight:'900' },
  track:   { height:7, backgroundColor:C.dim+'35', borderRadius:4, overflow:'hidden', position:'relative', marginBottom:3 },
  fill:    { height:'100%', borderRadius:4, position:'relative' },
  shim:    { position:'absolute', top:0, bottom:0, width:'20%', backgroundColor:'rgba(255,255,255,0.22)', transform:[{skewX:'-12deg'}] },
  hint:    { fontFamily:MONO, fontSize:7.5, color:C.dim, textAlign:'right' },
});

// ── Stats row — 4 cells compact ───────────────────────────────────
function StatsRow({ articles, sessions, topics, growthRate }: {
  articles: number; sessions: number; topics: number; growthRate: number;
}) {
  const cellW = (SW - 32 - 12) / 4; // full row ÷ 4
  const items = [
    { label:'VECTORS', value: articles,   color: C.cyan   },
    { label:'SESSIONS',value: sessions,   color: C.green  },
    { label:'TOPICS',  value: topics,     color: C.purple },
    { label:'GROW/H',  value: growthRate, color: C.amber  },
  ];
  return (
    <View style={{ flexDirection:'row', gap:4, marginBottom:10 }}>
      {items.map(({ label, value, color }) => (
        <View key={label} style={[sr.cell, { width: cellW, borderTopColor: color, borderColor: color + '30' }]}>
          <Text style={[sr.val, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {value > 9999 ? `${(value/1000).toFixed(1)}K` : String(value)}
          </Text>
          <Text style={sr.lbl}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
const sr = StyleSheet.create({
  cell: { backgroundColor:C.surf, borderRadius:9, borderWidth:1.5, borderTopWidth:3, paddingHorizontal:6, paddingVertical:8, alignItems:'center', gap:3 },
  val:  { fontFamily:MONO, fontSize:19, fontWeight:'900', lineHeight:22, letterSpacing:-0.5 },
  lbl:  { fontFamily:MONO, fontSize:7, fontWeight:'700', letterSpacing:0.8, color:C.mid },
});

// ── Personal Memory Panel — compact chip layout ───────────────────
function PersonalMemoryPanel({
  facts, events, upcoming, onAddFact, onAddEvent, onDeleteFact, onDeleteEvent,
}: {
  facts: PersonalFact[]; events: MemoryEvent[];
  upcoming: { event: MemoryEvent; daysUntil: number }[];
  onAddFact: (k: string, v: string) => void;
  onAddEvent: (t: string, d: string, ty: MemoryEvent['type']) => void;
  onDeleteFact: (id: string) => void; onDeleteEvent: (id: string) => void;
}) {
  const [mode, setMode] = useState<'list'|'addFact'|'addEvent'>('list');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evType, setEvType] = useState<MemoryEvent['type']>('birthday');
  const [search, setSearch] = useState('');

  const CAT_COL: Record<string, string> = { identity:C.cyan, family:C.pink, health:C.green, preferences:C.teal, work:C.amber, custom:C.blue };
  const TY_COL: Record<MemoryEvent['type'], string> = { birthday:C.pink, anniversary:C.purple, reminder:C.amber, deadline:C.red, custom:C.teal };
  const TY_ICO: Record<MemoryEvent['type'], string> = { birthday:'cake', anniversary:'favorite', reminder:'alarm', deadline:'timer', custom:'star' };

  const filtered = search.trim()
    ? facts.filter(f => f.key.toLowerCase().includes(search.toLowerCase()) || f.value.toLowerCase().includes(search.toLowerCase()))
    : facts;

  return (
    <View style={pm.wrap}>
      {/* Header */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:7, marginBottom:8 }}>
        <MaterialIcons name="psychology" size={12} color={C.purple} />
        <Text style={[pm.hdr, { color:C.purple }]}>PERSONAL MEMORY</Text>
        <View style={{ flex:1 }} />
        <Text style={pm.count}>{facts.length}F · {events.length}E</Text>
      </View>

      {/* Upcoming events strip */}
      {upcoming.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap:6, marginBottom:8 }}>
          {upcoming.slice(0, 5).map(({ event, daysUntil }) => {
            const col = TY_COL[event.type];
            const when = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'TMRW' : `${daysUntil}d`;
            return (
              <View key={event.id} style={[pm.upCard, { borderColor: col + '50', backgroundColor: col + '0A' }]}>
                <MaterialIcons name={TY_ICO[event.type] as any} size={10} color={col} />
                <Text style={[pm.upTitle, { color: col }]} numberOfLines={1}>{event.title}</Text>
                <View style={[pm.upBadge, { backgroundColor: col }]}>
                  <Text style={pm.upBadgeTxt}>{when}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Search */}
      <View style={pm.searchRow}>
        <MaterialIcons name="search" size={11} color={C.dim} />
        <TextInput style={pm.searchInput} value={search} onChangeText={setSearch}
          placeholder="Search memories..." placeholderTextColor={C.dim} />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{top:6,bottom:6,left:6,right:6}}>
            <MaterialIcons name="close" size={10} color={C.dim} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Fact chips — 3 columns */}
      {mode === 'list' && (
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:5, marginBottom:8 }}>
          {filtered.slice(0, 9).map(fact => {
            const col = CAT_COL[fact.category] || C.cyan;
            return (
              <TouchableOpacity key={fact.id} onLongPress={() => onDeleteFact(fact.id)}
                style={[pm.chip, { borderColor: col + '45', backgroundColor: col + '08', width:(SW-32-16)/3 }]}
                activeOpacity={0.8}>
                <Text style={[pm.chipKey, { color: col + 'AA' }]} numberOfLines={1}>{fact.key}</Text>
                <Text style={[pm.chipVal, { color: col }]} numberOfLines={1}>{fact.value}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Add Fact form */}
      {mode === 'addFact' && (
        <View style={pm.form}>
          <TextInput style={pm.formInput} value={newKey} onChangeText={setNewKey}
            placeholder="Key (e.g. My Name)" placeholderTextColor={C.dim} />
          <TextInput style={pm.formInput} value={newVal} onChangeText={setNewVal}
            placeholder="Value (e.g. Alex)" placeholderTextColor={C.dim} />
          <View style={{ flexDirection:'row', gap:7 }}>
            <TouchableOpacity style={[pm.formBtn, { borderColor:C.border }]} onPress={() => { setMode('list'); setNewKey(''); setNewVal(''); }}>
              <Text style={{ fontFamily:MONO, fontSize:10, color:C.mid }}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[pm.formBtn, { flex:2, backgroundColor:C.cyan }]}
              onPress={() => { if (newKey.trim() && newVal.trim()) { onAddFact(newKey.trim(), newVal.trim()); setMode('list'); setNewKey(''); setNewVal(''); } }}>
              <Text style={{ fontFamily:MONO, fontSize:10, color:'#000', fontWeight:'900' }}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Add Event form */}
      {mode === 'addEvent' && (
        <View style={pm.form}>
          <TextInput style={pm.formInput} value={evTitle} onChangeText={setEvTitle}
            placeholder="Event name" placeholderTextColor={C.dim} />
          <TextInput style={pm.formInput} value={evDate} onChangeText={setEvDate}
            placeholder="Date YYYY-MM-DD" placeholderTextColor={C.dim} keyboardType="numbers-and-punctuation" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:5, marginBottom:7 }}>
            {(['birthday','anniversary','reminder','deadline','custom'] as MemoryEvent['type'][]).map(t => (
              <TouchableOpacity key={t} onPress={() => setEvType(t)}
                style={{ borderWidth:1, borderRadius:6, paddingHorizontal:9, paddingVertical:4,
                  borderColor:(evType===t?TY_COL[t]:C.dim)+'55', backgroundColor:evType===t?TY_COL[t]+'15':'transparent' }}>
                <Text style={{ fontFamily:MONO, fontSize:8, fontWeight:'900', color:evType===t?TY_COL[t]:C.mid }}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection:'row', gap:7 }}>
            <TouchableOpacity style={[pm.formBtn, { borderColor:C.border }]} onPress={() => { setMode('list'); setEvTitle(''); setEvDate(''); }}>
              <Text style={{ fontFamily:MONO, fontSize:10, color:C.mid }}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[pm.formBtn, { flex:2, backgroundColor:C.cyan }]}
              onPress={() => { if (evTitle.trim() && evDate.trim()) { onAddEvent(evTitle.trim(), evDate.trim(), evType); setMode('list'); setEvTitle(''); setEvDate(''); } }}>
              <Text style={{ fontFamily:MONO, fontSize:10, color:'#000', fontWeight:'900' }}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Action buttons */}
      {mode === 'list' && (
        <View style={{ flexDirection:'row', gap:7 }}>
          <TouchableOpacity style={[pm.addBtn, { borderColor:C.cyan+'50', backgroundColor:C.cyan+'0A' }]}
            onPress={() => setMode('addFact')} activeOpacity={0.85}>
            <MaterialIcons name="add" size={12} color={C.cyan} />
            <Text style={[pm.addBtnTxt, { color:C.cyan }]}>FACT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[pm.addBtn, { borderColor:C.pink+'50', backgroundColor:C.pink+'0A' }]}
            onPress={() => setMode('addEvent')} activeOpacity={0.85}>
            <MaterialIcons name="event" size={12} color={C.pink} />
            <Text style={[pm.addBtnTxt, { color:C.pink }]}>EVENT</Text>
          </TouchableOpacity>
          {upcoming.length > 0 && (
            <View style={[pm.addBtn, { borderColor:C.amber+'45', backgroundColor:C.amber+'08', flex:0, paddingHorizontal:10 }]}>
              <MaterialIcons name="notifications-active" size={11} color={C.amber} />
              <Text style={[pm.addBtnTxt, { color:C.amber }]}>{upcoming.length}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
const pm = StyleSheet.create({
  wrap:        { backgroundColor:C.purple+'06', borderRadius:12, borderWidth:1, borderColor:C.purple+'28', padding:12, marginBottom:10 },
  hdr:         { fontFamily:MONO, fontSize:9, fontWeight:'900', letterSpacing:1.5 },
  count:       { fontFamily:MONO, fontSize:8, color:C.mid },
  upCard:      { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1, borderRadius:8, paddingHorizontal:8, paddingVertical:6, maxWidth:160 },
  upTitle:     { fontFamily:MONO, fontSize:10, fontWeight:'700', flex:1 },
  upBadge:     { borderRadius:5, paddingHorizontal:5, paddingVertical:2 },
  upBadgeTxt:  { fontFamily:MONO, fontSize:8, fontWeight:'900', color:'#000' },
  searchRow:   { flexDirection:'row', alignItems:'center', gap:7, backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:9, paddingVertical:6, marginBottom:8 },
  searchInput: { flex:1, fontFamily:MONO, fontSize:11, color:C.text },
  chip:        { borderWidth:1, borderRadius:9, paddingHorizontal:8, paddingVertical:7, overflow:'hidden' },
  chipKey:     { fontFamily:MONO, fontSize:7.5, fontWeight:'700', letterSpacing:0.3, marginBottom:1 },
  chipVal:     { fontFamily:MONO, fontSize:11, fontWeight:'900' },
  form:        { backgroundColor:C.bg, borderRadius:10, borderWidth:1, borderColor:C.border, padding:10, marginBottom:8, gap:7 },
  formInput:   { backgroundColor:C.surf, borderWidth:1, borderColor:C.border, borderRadius:7, paddingHorizontal:10, paddingVertical:9, fontFamily:MONO, fontSize:12, color:C.text },
  formBtn:     { flex:1, alignItems:'center', justifyContent:'center', borderWidth:1, borderRadius:8, paddingVertical:10 },
  addBtn:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderWidth:1.5, borderRadius:9, paddingVertical:9 },
  addBtnTxt:   { fontFamily:MONO, fontSize:10, fontWeight:'900', letterSpacing:0.3 },
});

// ── Quick URL Crawler — compact inline ────────────────────────────
function QuickCrawler({ onCrawl, isConnected }: { onCrawl: (url: string) => Promise<void>; isConnected: boolean }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const QUICK = [
    { lbl:'Python',  url:'https://docs.python.org/3/library/' },
    { lbl:'psutil',  url:'https://psutil.readthedocs.io/en/latest/' },
    { lbl:'Requests',url:'https://requests.readthedocs.io/en/latest/' },
    { lbl:'Selenium',url:'https://selenium-python.readthedocs.io/' },
  ];

  const submit = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await onCrawl(url.trim());
      setResult(`\u2713 Crawled: ${url.split('/')[2] || url}`);
      setUrl('');
    } catch (e: any) {
      setResult(`\u2717 ${e?.message || 'Failed'}`);
    } finally { setBusy(false); }
  };

  return (
    <View style={qc.wrap}>
      <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 }}>
        <MaterialIcons name="travel-explore" size={11} color={C.sigma} />
        <Text style={[qc.hdr, { color:C.sigma }]}>FEED AI A URL</Text>
        <View style={{ flex:1, height:1, backgroundColor:C.sigma+'25' }} />
      </View>
      {/* Input row */}
      <View style={qc.inputRow}>
        <TextInput style={qc.input} value={url} onChangeText={setUrl}
          placeholder="https://docs.python.org/3/..." placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" onSubmitEditing={submit} />
        <TouchableOpacity onPress={submit} disabled={busy || !url.trim()}
          style={[qc.btn, { backgroundColor: busy || !url.trim() ? C.sigma + '25' : C.sigma }]}
          activeOpacity={0.85}>
          {busy ? <ActivityIndicator size="small" color={C.sigma} style={{ transform:[{scale:0.7}] }} />
            : <MaterialIcons name="send" size={14} color={busy||!url.trim()?C.sigma:'#000'} />}
        </TouchableOpacity>
      </View>
      {/* Quick chips — scroll horizontal */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6, paddingTop:6 }}>
        {QUICK.map(q => (
          <TouchableOpacity key={q.lbl} onPress={() => setUrl(q.url)} activeOpacity={0.8}
            style={[qc.chip, { borderColor:C.sigma+'35', backgroundColor:C.sigma+'08' }]}>
            <Text style={{ fontFamily:MONO, fontSize:9, color:C.sigma+'CC', fontWeight:'700' }}>{q.lbl}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {result ? (
        <Text style={[qc.result, { color: result.startsWith('\u2713') ? C.green : C.red }]} numberOfLines={1}>{result}</Text>
      ) : null}
    </View>
  );
}
const qc2 = StyleSheet.create({});
const qc = StyleSheet.create({
  wrap:     { backgroundColor:C.sigma+'06', borderRadius:11, borderWidth:1, borderColor:C.sigma+'22', padding:11, marginBottom:10 },
  hdr:      { fontFamily:MONO, fontSize:9, fontWeight:'900', letterSpacing:1.5 },
  inputRow: { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:C.bg, borderWidth:1.5, borderColor:C.sigma+'40', borderRadius:9, paddingHorizontal:10 },
  input:    { flex:1, paddingVertical:9, fontSize:12, color:C.text, fontFamily:MONO },
  btn:      { width:32, height:32, borderRadius:8, alignItems:'center', justifyContent:'center', flexShrink:0 },
  chip:     { borderWidth:1, borderRadius:7, paddingHorizontal:9, paddingVertical:5 },
  result:   { fontFamily:MONO, fontSize:10, fontWeight:'700', marginTop:6 },
});

// ── Main Component ────────────────────────────────────────────────
export function AIBrainMasterpieceCard({ isConnected, serverAddr, onNavigateToKnowledge }: {
  isConnected: boolean; serverAddr?: string; onNavigateToKnowledge?: () => void;
}) {
  const [kbArticles, setKbArticles] = useState(0);
  const [sessions,   setSessions]   = useState(0);
  const [topics,     setTopics]     = useState(0);
  const [growthRate, setGrowthRate] = useState(0);
  const [crawlHist,  setCrawlHist]  = useState<{ url:string; ts:number; wordsAdded:number; topic:string }[]>([]);
  const [facts,      setFacts]      = useState<PersonalFact[]>([]);
  const [events,     setEvents]     = useState<MemoryEvent[]>([]);
  const [upcoming,   setUpcoming]   = useState<{ event:MemoryEvent; daysUntil:number }[]>([]);
  const [expanded,   setExpanded]   = useState(false);
  const [activeTab,  setActiveTab]  = useState<'brain'|'memory'|'crawler'|'tripwire'>('brain');
  const [tripState,  setTripState]  = useState<TripwireState>(neuralTripwire.getState());
  const prevArticles = useRef(0);
  const lastGrowth   = useRef(0);
  const glowA = useRef(new Animated.Value(0.4)).current;
  const starterSeeded = useRef(false);

  // Tripwire subscription
  useEffect(() => {
    const unsub = neuralTripwire.subscribe(s => setTripState(s));
    neuralTripwire.loadSavedBaseline();
    return unsub;
  }, []);

  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(glowA, { toValue:1,   duration:1600, useNativeDriver:false }),
      Animated.timing(glowA, { toValue:0.2, duration:1600, useNativeDriver:false }),
    ]));
    l.start(); return () => l.stop();
  }, []);

  const load = useCallback(async () => {
    try {
      await personalMemory.load();
      // Seed starter memory facts on first load (only once)
      if (!starterSeeded.current && personalMemory.getFacts().length === 0) {
        starterSeeded.current = true;
        const starters: Array<[string, string, PersonalFact['category']]> = [
          ['App', 'Butler AI v8.0', 'custom'],
          ['Mode', 'LAN-only · AES-256', 'custom'],
          ['AI Engine', 'Ollama on your PC', 'custom'],
          ['Auth', 'HMAC-SHA256 token', 'custom'],
          ['Privacy', 'Zero telemetry · local only', 'custom'],
        ];
        for (const [k, v, cat] of starters) {
          try { await personalMemory.addFact(k, v, cat); } catch {}
        }
      }
      setFacts(personalMemory.getFacts());
      setEvents(personalMemory.getEvents());
      setUpcoming(personalMemory.getUpcomingEvents(30));
      setCrawlHist(personalMemory.getCrawlHistory());
    } catch {}
    try {
      const stats = await knowledgeAccumulator.getStats?.().catch(() => null);
      if (stats) {
        const total = stats.totalFindings ?? 0;
        const prev  = prevArticles.current;
        prevArticles.current = total;
        setKbArticles(total);
        setSessions(stats.totalSessions ?? 0);
        setTopics(Math.min((stats.totalSessions ?? 0) * 3, 200));
        const now = Date.now();
        const elapsed = (now - lastGrowth.current) / 3600000;
        if (lastGrowth.current > 0 && elapsed > 0 && total > prev)
          setGrowthRate(Math.max(0, Math.round((total - prev) / elapsed)));
        lastGrowth.current = now;
      }
    } catch {}
    if (isConnected) {
      try {
        const ip = serverConnection.getIP?.(); const port = serverConnection.getPort?.();
        if (ip && port) {
          const tok = serverConnection.getToken?.();
          const h: Record<string,string> = tok ? { Authorization:'Bearer '+tok } : {};
          const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000);
          const res = await fetch(`http://${ip}:${port}/api/learn/status`, { headers:h, signal:c.signal }).finally(() => clearTimeout(t));
          if (res.ok) {
            const d = await res.json();
            const sv = d.articlesTotal ?? d.vectorCount ?? 0;
            if (sv > 0) setKbArticles(p => Math.max(p, sv));
          }
        }
      } catch {}
    }
  }, [isConnected]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const handleCrawl = useCallback(async (url: string) => {
    const topic = url.split('/')[2] || url;
    try {
      const r = await sigmaNetCrawler.crawlViaRelay({ url, domain:'Python', topic, mode:'fetch' }, () => {});
      if (r.error) throw new Error(r.error);
      await personalMemory.addCrawlEntry(url, r.wordCount, topic);
      setCrawlHist(personalMemory.getCrawlHistory());
      setTimeout(load, 2000);
    } catch {
      try {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
        const res = await fetch(url, { headers:{'User-Agent':'Butler/1.0'}, signal:c.signal }).finally(() => clearTimeout(t));
        const html = await res.text();
        const clean = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,6000);
        const compressed = knowledgeAccumulator.compressResearch(clean, 'Python', topic, url);
        knowledgeAccumulator.addFinding(compressed);
        await knowledgeAccumulator.saveNow();
        await personalMemory.addCrawlEntry(url, clean.length / 5, topic);
        setCrawlHist(personalMemory.getCrawlHistory());
        setTimeout(load, 2000);
      } catch (e: any) { throw e; }
    }
  }, [load]);

  const handleAddFact  = useCallback(async (k:string, v:string)   => { await personalMemory.addFact(k,v); setFacts(personalMemory.getFacts()); }, []);
  const handleAddEvent = useCallback(async (t:string, d:string, ty:MemoryEvent['type']) => {
    await personalMemory.addEvent({ title:t, date:d, type:ty, recurring: ty==='birthday'||ty==='anniversary' });
    setEvents(personalMemory.getEvents()); setUpcoming(personalMemory.getUpcomingEvents(30));
  }, []);
  const handleDelFact  = useCallback(async (id:string) => { await personalMemory.removeFact(id); setFacts(personalMemory.getFacts()); }, []);
  const handleDelEvent = useCallback(async (id:string) => { await personalMemory.removeEvent(id); setEvents(personalMemory.getEvents()); setUpcoming(personalMemory.getUpcomingEvents(30)); }, []);

  const { level, title: lvlTitle } = useMemo(() => getLevel(kbArticles), [kbArticles]);
  const lvlCol = ACCENT_COLORS[Math.min(level - 1, ACCENT_COLORS.length - 1)];
  const borderC = glowA.interpolate({ inputRange:[0.2,1], outputRange:[C.cyan+'30',C.cyan+'88'] });

  const TABS = [
    { key:'brain'   as const, lbl:'BRAIN',    col:C.cyan    },
    { key:'memory'  as const, lbl:'MEMORY',   col:C.purple  },
    { key:'crawler' as const, lbl:'CRAWLER',  col:C.sigma   },
    { key:'tripwire'as const, lbl:'TRIPWIRE', col:C.green   },
  ];

  return (
    <Animated.View style={[main.wrap, { borderColor:borderC }]}>
      {/* Colour stripe */}
      <View style={{ height:3, flexDirection:'row' }}>
        {[C.cyan,C.purple,C.green,C.sigma,C.amber,C.pink,C.teal,C.blue].map((c,i) => (
          <View key={i} style={{ flex:1, backgroundColor:c }} />
        ))}
      </View>

      {/* Compact header row */}
      <TouchableOpacity style={main.header} onPress={() => { haptics.light(); setExpanded(e=>!e); }} activeOpacity={0.88}>
        {/* Brain orb */}
        <Animated.View style={[main.orb, { borderColor:glowA.interpolate({inputRange:[0.2,1],outputRange:[C.cyan+'35',C.cyan+'AA']}) }]}>
          <MaterialCommunityIcons name="brain" size={20} color={C.cyan} />
          <Animated.View style={[main.orbDot, { backgroundColor:lvlCol, opacity:glowA }]} />
        </Animated.View>
        {/* Title + level */}
        <View style={{ flex:1 }}>
          <Text style={main.title}>NEURAL KB</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:5, marginTop:3, flexWrap:'wrap' }}>
            <View style={[main.lvlBadge, { borderColor:lvlCol+'60', backgroundColor:lvlCol+'14' }]}>
              <Text style={[main.lvlTxt, { color:lvlCol }]}>LVL {level} · {lvlTitle}</Text>
            </View>
            <View style={[main.statBadge, { borderColor:C.cyan+'40' }]}>
              <Text style={[main.statBadgeTxt, { color:C.cyan }]}>{kbArticles} VEC</Text>
            </View>
            {upcoming.length > 0 && (
              <View style={[main.statBadge, { borderColor:C.pink+'45', backgroundColor:C.pink+'09' }]}>
                <MaterialIcons name="notifications" size={8} color={C.pink} />
                <Text style={[main.statBadgeTxt, { color:C.pink }]}>{upcoming.length}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Right actions */}
        <View style={{ gap:5, alignItems:'center' }}>
          <TouchableOpacity onPress={onNavigateToKnowledge}
            hitSlop={{top:8,bottom:8,left:8,right:8}}
            style={[main.iconBtn, { borderColor:C.cyan+'40' }]}>
            <MaterialIcons name="open-in-full" size={12} color={C.cyan} />
          </TouchableOpacity>
          <MaterialIcons name={expanded?'expand-less':'expand-more'} size={16} color={C.mid} />
        </View>
      </TouchableOpacity>

      {/* Always-visible: stats row + level bar */}
      <View style={{ paddingHorizontal:14, paddingBottom: expanded ? 0 : 14 }}>
        <StatsRow articles={kbArticles} sessions={sessions} topics={topics} growthRate={growthRate} />
        <LevelBar articles={kbArticles} />
      </View>

      {/* Expanded section */}
      {expanded && (
        <View style={main.expandedWrap}>
          {/* Tab bar */}
          <View style={main.tabBar}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}
                style={[main.tabBtn, activeTab===tab.key && { borderBottomColor:tab.col, backgroundColor:tab.col+'0C' }]}>
                <Text style={[main.tabTxt, { color:activeTab===tab.key?tab.col:C.mid }]}>{tab.lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ paddingHorizontal:14, paddingTop:10, paddingBottom:14 }}>
            {activeTab==='brain' && (
              <>
                <NeuralBrain kbArticles={kbArticles} isConnected={isConnected} sessions={sessions} />
                {/* Recent crawls */}
                {crawlHist.length > 0 && (
                  <View style={{ backgroundColor:C.teal+'06', borderRadius:10, borderWidth:1, borderColor:C.teal+'25', padding:10 }}>
                    <Text style={{ fontFamily:MONO, fontSize:8.5, fontWeight:'900', color:C.teal, letterSpacing:1, marginBottom:7 }}>RECENTLY CRAWLED</Text>
                    {crawlHist.slice(0,3).map((e,i)=>(
                      <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:4 }}>
                        <View style={{ width:5, height:5, borderRadius:3, backgroundColor:C.teal }} />
                        <View style={{ flex:1 }}>
                          <Text style={{ fontFamily:MONO, fontSize:10, color:C.text, fontWeight:'700' }} numberOfLines={1}>{e.url.split('/')[2]||e.url}</Text>
                          <Text style={{ fontFamily:MONO, fontSize:8, color:C.mid }}>
                            {Math.round((Date.now()-e.ts)/60000)}m ago · ~{e.wordsAdded} words
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            {activeTab==='memory' && (
              <PersonalMemoryPanel facts={facts} events={events} upcoming={upcoming}
                onAddFact={handleAddFact} onAddEvent={handleAddEvent}
                onDeleteFact={handleDelFact} onDeleteEvent={handleDelEvent} />
            )}
            {activeTab==='tripwire' && (
              <View style={{ backgroundColor:C.green+'06', borderRadius:11, borderWidth:1, borderColor:C.green+'22', padding:12, marginBottom:10 }}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:10 }}>
                  <MaterialCommunityIcons name="waveform" size={12} color={C.green} />
                  <Text style={{ fontFamily:MONO, fontSize:9, fontWeight:'900', color:C.green, letterSpacing:1.5 }}>NEURAL TRIPWIRE — MITM DETECTION</Text>
                </View>
                {/* Status */}
                <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  {([
                    ['STATUS', tripState.status.toUpperCase(), tripState.status==='alert'?C.red:tripState.status==='monitoring'?C.green:tripState.status==='learning'?C.amber:C.mid],
                    ['ALERT', tripState.alertLevel, tripState.alertLevel==='HIGH'?C.red:tripState.alertLevel==='MEDIUM'?C.amber:C.green],
                    ['ΣDEV', `${tripState.deviationSigma}σ`, Math.abs(tripState.deviationSigma)>2?C.red:C.green],
                    ['LIVE', tripState.liveLastMs>0?`${tripState.liveLastMs}ms`:'—', C.cyan],
                    ['BASE', tripState.baseline?`${Math.round(tripState.baseline.meanMs)}ms`:'BUILDING', C.purple],
                    ['SMPL', `${tripState.samplesCollected}/${tripState.samplesNeeded}`, C.amber],
                  ] as const).map(([lbl,val,col],i)=>(
                    <View key={i} style={{ borderWidth:1, borderRadius:8, borderColor:col+'40', backgroundColor:col+'0A', paddingHorizontal:8, paddingVertical:5, alignItems:'center', minWidth:60 }}>
                      <Text style={{ fontFamily:MONO, fontSize:7, color:col+'90', fontWeight:'700' }}>{lbl}</Text>
                      <Text style={{ fontFamily:MONO, fontSize:11, color:col, fontWeight:'900', marginTop:2 }}>{val}</Text>
                    </View>
                  ))}
                </View>
                {tripState.status==='learning' && (
                  <View style={{ marginBottom:8 }}>
                    <View style={{ height:5, backgroundColor:C.dim+'25', borderRadius:3, overflow:'hidden' }}>
                      <View style={{ height:'100%', width:`${(tripState.samplesCollected/tripState.samplesNeeded)*100}%`, backgroundColor:C.amber, borderRadius:3 }} />
                    </View>
                    <Text style={{ fontFamily:MONO, fontSize:8, color:C.amber, marginTop:4 }}>Building baseline — {tripState.samplesNeeded-tripState.samplesCollected} more pings needed</Text>
                  </View>
                )}
                {tripState.alertLevel!=='NONE' && (
                  <View style={{ borderWidth:1, borderLeftWidth:3, borderRadius:8, borderColor:(tripState.alertLevel==='HIGH'?C.red:C.amber)+'30', borderLeftColor:tripState.alertLevel==='HIGH'?C.red:C.amber, backgroundColor:(tripState.alertLevel==='HIGH'?C.red:C.amber)+'07', padding:9, marginBottom:8 }}>
                    <Text style={{ fontFamily:MONO, fontSize:9, color:tripState.alertLevel==='HIGH'?C.red:C.amber, lineHeight:13 }}>{tripState.alertMessage||'Latency anomaly detected'}</Text>
                  </View>
                )}
                {tripState.status==='monitoring' && tripState.alertLevel==='NONE' && (
                  <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                    <MaterialIcons name="verified" size={13} color={C.green} />
                    <Text style={{ fontFamily:MONO, fontSize:9, color:C.green }}>No MITM proxy detected · Connection pattern normal</Text>
                  </View>
                )}
                <Text style={{ fontFamily:MONO, fontSize:8, color:C.mid, marginTop:8 }}>Monitors latency baseline · {'>'}{'>'}2σ deviation = MITM alert · fully client-side</Text>
              </View>
            )}
            {activeTab==='crawler' && (
              <>
                <QuickCrawler onCrawl={handleCrawl} isConnected={isConnected} />
                <Text style={{ fontFamily:MONO, fontSize:9, fontWeight:'900', color:C.mid, letterSpacing:1, marginBottom:8 }}>
                  CRAWL HISTORY ({crawlHist.length})
                </Text>
                {crawlHist.length === 0 ? (
                  <View style={{ alignItems:'center', paddingVertical:20, gap:7 }}>
                    <MaterialIcons name="travel-explore" size={30} color={C.dim} />
                    <Text style={{ fontFamily:MONO, fontSize:11, color:C.mid }}>No URLs crawled yet</Text>
                  </View>
                ) : crawlHist.map((e,i)=>(
                  <View key={i} style={{ flexDirection:'row', gap:8, paddingVertical:6, borderBottomWidth:1, borderBottomColor:C.border }}>
                    <View style={{ width:5, height:5, borderRadius:3, backgroundColor:C.sigma, marginTop:4, flexShrink:0 }} />
                    <View style={{ flex:1 }}>
                      <Text style={{ fontFamily:MONO, fontSize:10, color:C.sigma, fontWeight:'700' }} numberOfLines={1}>{e.url}</Text>
                      <Text style={{ fontFamily:MONO, fontSize:8, color:C.mid, marginTop:1 }}>
                        {new Date(e.ts).toLocaleString()} · {e.wordsAdded} words
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const main = StyleSheet.create({
  wrap:       { backgroundColor:C.card, borderRadius:14, borderWidth:1.5, borderColor:C.border, overflow:'hidden', marginBottom:14,
    ...Platform.select({ ios:{shadowColor:C.cyan,shadowOffset:{width:0,height:5},shadowOpacity:0.14,shadowRadius:16}, android:{elevation:7} }) },
  header:     { flexDirection:'row', alignItems:'flex-start', gap:11, padding:14, paddingBottom:10 },
  orb:        { width:50, height:50, borderRadius:25, borderWidth:1.5, backgroundColor:C.cyan+'0D', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 },
  orbDot:     { position:'absolute', top:3, right:3, width:8, height:8, borderRadius:4, borderWidth:1.5, borderColor:C.bg },
  title:      { fontFamily:MONO, fontSize:12, fontWeight:'900', color:C.text, letterSpacing:0.5 },
  lvlBadge:   { borderWidth:1.5, borderRadius:8, paddingHorizontal:7, paddingVertical:3 },
  lvlTxt:     { fontFamily:MONO, fontSize:8.5, fontWeight:'900', letterSpacing:0.4 },
  statBadge:  { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1, borderRadius:7, paddingHorizontal:6, paddingVertical:2.5 },
  statBadgeTxt:{ fontFamily:MONO, fontSize:8, fontWeight:'900' },
  iconBtn:    { width:28, height:28, borderRadius:7, borderWidth:1, alignItems:'center', justifyContent:'center', backgroundColor:C.cyan+'08' },
  expandedWrap:{ borderTopWidth:1, borderTopColor:C.border },
  tabBar:     { flexDirection:'row', borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:     { flex:1, paddingVertical:10, alignItems:'center', borderBottomWidth:3, borderBottomColor:'transparent' },
  tabTxt:     { fontFamily:MONO, fontSize:9, fontWeight:'900', letterSpacing:0.4 },
});

export default AIBrainMasterpieceCard;
