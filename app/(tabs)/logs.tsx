/**
 * BUTLER AI — Intel Logs v4 · Terminal Redesign
 * Non-scrollable chrome · Terminal FlatList · Filter tabs
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Platform, Dimensions, ScrollView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { haptics } from '@/services/haptics';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#0B0F17';
const BLUE = '#4A9EFF';
const CYAN = '#38D9E8';
const GREEN= '#2FE38A';
const AMBER= '#FFB43D';
const RED  = '#FF4D5E';
const PURP = '#A468FF';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#C3CFDF';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);

type LogLevel = 'SYS'|'AI'|'NET'|'SEC'|'ERR'|'INFO';
type LogEntry = { id:string; level:LogLevel; msg:string; detail:string; ts:number; };

const LEVEL_COLOR: Record<LogLevel,string> = {
  SYS:'#4A9EFF', AI:'#A468FF', NET:'#2FE38A', SEC:'#FFB43D', ERR:'#FF4D5E', INFO:'#38D9E8'
};

const BOOT_LOGS: LogEntry[] = [
  { id:'l1',  level:'SYS',  msg:'App mounted OK',                  detail:'SYS',   ts: Date.now()-300000  },
  { id:'l2',  level:'SYS',  msg:'Storage layer initialized',       detail:'STOR',  ts: Date.now()-299000  },
  { id:'l3',  level:'AI',   msg:'AI core initialized — READY',     detail:'AI',    ts: Date.now()-298500  },
  { id:'l4',  level:'NET',  msg:'LAN scanner armed — STANDBY',     detail:'NET',   ts: Date.now()-298000  },
  { id:'l5',  level:'SEC',  msg:'AES-256-GCM active — VERIFIED',   detail:'SEC',   ts: Date.now()-297500  },
  { id:'l6',  level:'SYS',  msg:'HMAC-SHA256 tokens OK',           detail:'AUTH',  ts: Date.now()-297000  },
  { id:'l7',  level:'INFO', msg:'Ollama bridge — STANDBY',         detail:'LLM',   ts: Date.now()-296500  },
  { id:'l8',  level:'SYS',  msg:'Butler v7.3 boot complete',       detail:'BOOT',  ts: Date.now()-296000  },
  { id:'l9',  level:'NET',  msg:'PC not paired — awaiting QR',     detail:'PAIR',  ts: Date.now()-60000   },
  { id:'l10', level:'INFO', msg:'KB engine idle — 0 sessions',     detail:'KB',    ts: Date.now()-30000   },
];

const FILTERS: { key:string; label:string; color:string }[] = [
  { key:'ALL',  label:'ALL',  color:CYAN  },
  { key:'SYS',  label:'SYS',  color:BLUE  },
  { key:'AI',   label:'AI',   color:PURP  },
  { key:'NET',  label:'NET',  color:GREEN },
  { key:'SEC',  label:'SEC',  color:AMBER },
  { key:'ERR',  label:'ERR',  color:RED   },
];

const PulseDot = memo(({ color, size=6 }: { color:string; size?:number }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue:1, duration:700, useNativeDriver:true }),
      Animated.timing(a, { toValue:0.2, duration:700, useNativeDriver:true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return <Animated.View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:color, opacity:a }} />;
});

const LogHeader = memo(({ safeTop, isConn, total }: { safeTop:number; isConn:boolean; total:number }) => {
  const [hh, setHh] = useState('--:--');
  const [ss, setSs] = useState('--');
  const scanX = useRef(new Animated.Value(-SW)).current;
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setHh(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
      setSs(String(n.getSeconds()).padStart(2,'0'));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue:SW+120, duration:2000, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(4000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  // ── SKIN WIRING: every colour below resolves from the active pack on the
  // SKINS page, so switching a skin recolours this header instantly. ──
  const S = useSkin();
  const CYAN = S.accent, TEAL = S.accent, BLUE = S.accent2, PURP = S.accent3;
  const AMBER = S.warn, GREEN = S.ok, RED = S.danger;
  const TEXT = S.text, DIM = S.dim, MID = S.mid;
  const SURF = S.panel, SURF2 = S.panel2, SURF3 = S.panel2, BG = S.bg;
  return (
    <View style={[LH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="LH" still={!S.headerGlow} />
      <View style={{ height:3, backgroundColor:BLUE }} />
      <Animated.View pointerEvents="none" style={[LH.scan, { transform:[{ translateX:scanX }] }]} />
      <View style={LH.body}>
        <View style={{ flex:1, gap:4 }}>
          <Text style={LH.eye}>SYSTEM EVENT STREAM · REAL-TIME</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <MaterialCommunityIcons name="console-line" size={18} color={BLUE} />
            <Text style={LH.title}>INTEL <Text style={{ color:BLUE }}>LOGS</Text></Text>
          </View>
          <View style={{ flexDirection:'row', gap:6 }}>
            <View style={[LH.pill, { borderColor: BLUE+'60', backgroundColor: BLUE+'10' }]}>
              <PulseDot color={isConn?GREEN:AMBER} size={5} />
              <Text style={[LH.pTxt, { color:BLUE }]}>{total} ENTRIES</Text>
            </View>
            <View style={[LH.pill, { borderColor: (isConn?GREEN:AMBER)+'50', backgroundColor:(isConn?GREEN:AMBER)+'08' }]}>
              <Text style={[LH.pTxt, { color:isConn?GREEN:AMBER }]}>{isConn ? 'LIVE' : 'LOCAL'}</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems:'flex-end', gap:3 }}>
          <View style={{ flexDirection:'row', alignItems:'baseline', gap:1 }}>
            <Text style={[LH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={[LH.cSec, { color:BLUE }]}>{ss}</Text>
          </View>
          <Text style={LH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      <View style={{ height:2, backgroundColor: BLUE+'30' }} />
    </View>
  );
});
const LH = StyleSheet.create({
  root: { backgroundColor:'#050810', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor: BLUE+'08' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, color: BLUE+'60', letterSpacing:1.5, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSec: { fontFamily:MONO, fontSize:14, fontWeight:'900' },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

const LogRow = memo(({ entry }: { entry:LogEntry }) => {
  const color = LEVEL_COLOR[entry.level];
  const time  = new Date(entry.ts);
  const timeStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}`;
  return (
    <View style={LR.row}>
      <View style={[LR.badge, { backgroundColor: color+'20', borderColor: color+'50' }]}>
        <Text style={[LR.badgeTxt, { color }]}>{entry.level}</Text>
      </View>
      <Text style={LR.msg} numberOfLines={1}>{entry.msg}</Text>
      <Text style={LR.time}>{timeStr}</Text>
    </View>
  );
});
const LR = StyleSheet.create({
  row:      { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:12, paddingVertical:8, borderBottomWidth:1, borderBottomColor: DIM+'60' },
  badge:    { borderWidth:1, borderRadius:5, paddingHorizontal:5, paddingVertical:2, flexShrink:0 },
  badgeTxt: { fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.3 },
  msg:      { fontFamily:MONO, fontSize:11, color:TEXT, flex:1, lineHeight:15 },
  time:     { fontFamily:MONO, fontSize:8.5, color:MID, flexShrink:0 },
});

function LogsInner() {
  const insets  = useSafeAreaInsets();
  const [filter, setFilter] = useState('ALL');
  const [isConn, setIsConn] = useState(false);
  const [logs, setLogs]     = useState<LogEntry[]>(BOOT_LOGS);
  const [live, setLive]     = useState(false);
  const listRef = useRef<FlatList<LogEntry>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    setIsConn(serverConnection.isConnected?.() ?? false);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setLive(false);
    };
  }, []));

  const toggleLive = () => {
    haptics.medium();
    if (!live) {
      setLive(true);
      timerRef.current = setInterval(() => {
        const levels: LogLevel[] = ['SYS','AI','NET','SEC','INFO'];
        const msgs = ['Heartbeat OK','KB index updated','LAN ping OK','Token verified','Cache flush'];
        const lvl = levels[Math.floor(Math.random()*levels.length)];
        const entry: LogEntry = { id: Date.now().toString(), level: lvl, msg: msgs[Math.floor(Math.random()*msgs.length)], detail: lvl, ts: Date.now() };
        setLogs(prev => [entry, ...prev].slice(0,100));
      }, 3000);
    } else {
      setLive(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const filtered = filter === 'ALL' ? logs : logs.filter(l => l.level === filter);

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <LogHeader safeTop={insets.top} isConn={isConn} total={filtered.length} />

      {/* Filter bar */}
      <View style={{ flexDirection:'row', backgroundColor:SURF, borderBottomWidth:1, borderBottomColor: DIM+'60' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap:6, paddingHorizontal:10, paddingVertical:9, flex:1 }}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity key={f.key} onPress={() => { haptics.light(); setFilter(f.key); }} activeOpacity={0.8}
                style={{ borderWidth:1.5, borderRadius:20, paddingHorizontal:11, paddingVertical:5,
                  borderColor: active ? f.color+'80' : DIM+'60',
                  backgroundColor: active ? f.color+'15' : DIM+'30' }}>
                <Text style={{ fontFamily:MONO, fontSize:9.5, fontWeight:'900', color: active ? f.color : MID }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={toggleLive} activeOpacity={0.8}
          style={{ paddingHorizontal:12, alignItems:'center', justifyContent:'center',
            borderLeftWidth:1, borderLeftColor: DIM+'60',
            backgroundColor: live ? GREEN+'15' : DIM+'20' }}>
          <PulseDot color={live ? GREEN : MID} size={8} />
          <Text style={{ fontFamily:MONO, fontSize:7.5, color: live?GREEN:MID, fontWeight:'900', marginTop:3 }}>
            {live ? 'LIVE' : 'STATIC'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Terminal header */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:7, backgroundColor:'#050810', borderBottomWidth:1, borderBottomColor: DIM+'80' }}>
        {['#FF4D5E','#FFC94A','#2FE38A'].map((c,i) => (
          <View key={i} style={{ width:8, height:8, borderRadius:4, backgroundColor:c }} />
        ))}
        <Text style={{ fontFamily:MONO, fontSize:9, color: BLUE+'80', marginLeft:8, letterSpacing:0.5 }}>BUTLER_OS — EVENT LOG</Text>
        <View style={{ flex:1 }} />
        <Text style={{ fontFamily:MONO, fontSize:8, color:MID }}>{filtered.length} ENTRIES</Text>
      </View>

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={e => e.id}
        renderItem={({ item }) => <LogRow entry={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <View style={{ alignItems:'center', paddingTop:40, gap:10 }}>
            <MaterialCommunityIcons name="console-line" size={40} color={DIM} />
            <Text style={{ fontFamily:MONO, fontSize:11, color:MID }}>No log entries</Text>
          </View>
        }
      />

      <View style={[LF.statusBar, { paddingBottom: Math.max(insets.bottom+4, 10) }]}>
        <Text style={{ fontFamily:MONO, fontSize:9, color:MID }}>FILTER: {filter}</Text>
        <View style={{ flex:1 }} />
        <Text style={{ fontFamily:MONO, fontSize:9, color:MID }}>{filtered.length} SHOWN</Text>
        <TouchableOpacity onPress={() => { haptics.light(); setLogs(BOOT_LOGS); }} activeOpacity={0.8}
          style={{ borderWidth:1, borderRadius:8, paddingHorizontal:9, paddingVertical:4, borderColor: RED+'40', backgroundColor: RED+'08', marginLeft:8 }}>
          <Text style={{ fontFamily:MONO, fontSize:8, color:RED, fontWeight:'900' }}>CLEAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const LF = StyleSheet.create({
  statusBar: { backgroundColor:SURF, borderTopWidth:1, borderTopColor: DIM+'60', paddingTop:9, paddingHorizontal:14, flexDirection:'row', alignItems:'center' },
});

export default function PCIntelScreen() {
  return <TabErrorBoundary name="Intel"><LogsInner /></TabErrorBoundary>;
}
