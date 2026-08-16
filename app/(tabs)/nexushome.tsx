/**
 * BUTLER AI — Nexus Home v10 · Compact Dashboard
 * Non-scrollable chrome · 2×2 telemetry grid · Quick nav
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Animated, Platform, Dimensions, RefreshControl, ScrollView, FlatList,
} from 'react-native';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { connectionHub } from '@/services/connectionHub';
import { haptics } from '@/services/haptics';
import { GitHubUpdateBanner } from '@/components/ui/GitHubUpdateBanner';
import { otaUpdates } from '@/services/otaUpdates';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#0B0F17';
const CYAN = '#38D9E8';
const GREEN= '#2FE38A';
const AMBER= '#FFB43D';
const RED  = '#FF4D5E';
const PURP = '#A468FF';
const BLUE = '#4A9EFF';
const TEAL = '#38D9E8';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);
const PAD  = 12;
const CARD = (SW - PAD*2 - 8) / 2;

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

// Compact header
const NexusHeader = memo(({ safeTop, isConn, addr, cpu, ram }: {
  safeTop:number; isConn:boolean; addr:string; cpu:number; ram:number;
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
    const t = setInterval(() => {
      const n = new Date();
      setHh(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
      setSs(String(n.getSeconds()).padStart(2,'0'));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue:SW+120, duration:2200, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(5500),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  const cc = isConn ? GREEN : AMBER;
  return (
    <View style={[NH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="NH" still={!S.headerGlow} />
      <View style={{ height:3, flexDirection:'row' }}>
        <View style={{ flex:3, backgroundColor:CYAN }} />
        <View style={{ flex:2, backgroundColor:PURP }} />
        <View style={{ flex:2, backgroundColor:AMBER }} />
      </View>
      <Animated.View pointerEvents="none" style={[NH.scan, { transform:[{translateX:scanX}] }]} />
      <View style={NH.body}>
        <View style={{ flex:1, gap:3 }}>
          <Text style={[NH.eye, { color: CYAN+'66' }]}>COMMAND DECK · PC AUTOMATION</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <View style={{ width:24, height:24, borderRadius:8, borderWidth:1.5, borderColor:CYAN+'55', backgroundColor:CYAN+'12', alignItems:'center', justifyContent:'center' }}>
              <MaterialCommunityIcons name="robot-outline" size={15} color={CYAN} />
            </View>
            <Text style={[NH.title, { color:TEXT }]}>BUTLER <Text style={{ color:CYAN }}>AI</Text></Text>
          </View>
          <View style={{ flexDirection:'row', gap:5 }}>
            <View style={[NH.pill, { borderColor: cc+'60', backgroundColor: cc+'10' }]}>
              <PulseDot color={cc} size={5} />
              <Text style={[NH.pTxt, { color:cc }]}>{isConn ? addr.split(':')[0]||'ONLINE' : 'OFFLINE'}</Text>
            </View>
            {isConn && (
              <View style={[NH.pill, { borderColor: CYAN+'40', backgroundColor: CYAN+'08' }]}>
                <Text style={[NH.pTxt, { color:CYAN }]}>CPU {Math.round(cpu)}%</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems:'flex-end', gap:2 }}>
          <View style={{ flexDirection:'row', alignItems:'baseline', gap:1 }}>
            <Text style={[NH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={[NH.cSec, { color:CYAN }]}>{ss}</Text>
          </View>
          <Text style={NH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      <View style={{ height:2, backgroundColor: CYAN+'28' }} />
    </View>
  );
});
const NH = StyleSheet.create({
  root: { backgroundColor:'#070A10', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor: CYAN+'07' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:10, paddingBottom:11, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7, color: CYAN+'55', letterSpacing:1.8, fontWeight:'700' },
  title:{ fontSize:20, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1.5, borderRadius:18, paddingHorizontal:8, paddingVertical:3 },
  pTxt: { fontFamily:MONO, fontSize:8.5, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:20, fontWeight:'900', letterSpacing:1 },
  cSec: { fontFamily:MONO, fontSize:12, fontWeight:'900' },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

// Telemetry card
const TCard = memo(({ title, icon, color, big, sub, panel, textDim, children }: {
  title:string; icon:string; color:string; big:string; sub:string;
  panel?:string; textDim?:string; children?:React.ReactNode;
}) => (
  <View style={[TC.card, { borderTopColor:color, borderColor:color+'30', backgroundColor: panel ?? SURF }]}>
    <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginBottom:4 }}>
      <MaterialCommunityIcons name={icon as any} size={10} color={color} />
      <Text style={[TC.title, { color }]}>{title}</Text>
      <PulseDot color={color} size={5} />
    </View>
    <Text style={[TC.big, { color }]}>{big}</Text>
    <Text style={[TC.sub, textDim ? { color:textDim } : null]}>{sub}</Text>
    {children}
  </View>
));
const TC = StyleSheet.create({
  card:  { width:CARD, backgroundColor:SURF, borderRadius:12, borderWidth:1.5, borderTopWidth:2.5, padding:10, gap:2 },
  title: { fontFamily:MONO, fontSize:7.5, fontWeight:'900', letterSpacing:0.8, flex:1 },
  big:   { fontFamily:MONO, fontSize:20, fontWeight:'900', lineHeight:24 },
  sub:   { fontFamily:MONO, fontSize:8.5, color:MID, lineHeight:12 },
});

// Quick nav tile component — hooks must be at component level, NOT inside map()
type NavItem = { icon: string; label: string; tab: string; color: string };
const NavTile = memo(({ item, goToTab }: { item: NavItem; goToTab: (t:string)=>void }) => {
  const scaleA = useRef(new Animated.Value(1)).current;
  const SW_NAV = Math.max(320, Dimensions.get('window').width);
  const PAD_NAV = 12;
  return (
    <Pressable
      onPress={() => goToTab(item.tab)}
      onPressIn={() => Animated.spring(scaleA, { toValue:0.88, tension:400, friction:12, useNativeDriver:true }).start()}
      onPressOut={() => Animated.spring(scaleA, { toValue:1, tension:280, friction:10, useNativeDriver:true }).start()}
      style={{ width:(SW_NAV-PAD_NAV*2-7*4)/5, alignItems:'center' }}>
      <Animated.View style={[NK.cell, { borderColor:item.color+'35', borderTopColor:item.color, backgroundColor:item.color+'09', transform:[{scale:scaleA}] }]}>
        <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
        <Text style={[NK.label, { color:item.color+'BB' }]}>{item.label}</Text>
      </Animated.View>
    </Pressable>
  );
});

// Quick nav tiles
const NAV_ITEMS = [
  { icon:'robot-happy-outline', label:'AI',      tab:'butler',    color:PURP  },
  { icon:'code-braces',         label:'SCRIPTS',  tab:'scripts',   color:CYAN  },
  { icon:'brain',               label:'KB',       tab:'knowledge', color:AMBER },
  { icon:'folder-network',      label:'FILES',    tab:'fileshare', color:GREEN },
  { icon:'console-line',        label:'LOGS',     tab:'logs',      color:BLUE  },
  { icon:'hammer-screwdriver',  label:'BUILD',    tab:'builder',   color:TEAL  },
  { icon:'palette-swatch',      label:'SKINS',    tab:'cosmetic',  color:PURP  },
  { icon:'tune-variant',        label:'CONFIG',   tab:'settings',  color:MID   },
  { icon:'server-network',      label:'PAIR',     tab:'connect',   color:GREEN },
];

function NexusHomeInner() {
  const insets = useSafeAreaInsets();
  // ── SKIN WIRING: the whole dashboard recolours instantly from the SKINS page ──
  const S = useSkin();
  const CYAN = S.accent, TEAL = S.accent, BLUE = S.accent2, PURP = S.accent3;
  const AMBER = S.warn, GREEN = S.ok, RED = S.danger;
  const TEXT = S.text, DIM = S.dim, MID = S.mid;
  const SURF = S.panel, BG = S.bg;
  const NAV_ITEMS: NavItem[] = [
    { icon:'robot-happy-outline', label:'AI',      tab:'butler',    color:PURP  },
    { icon:'code-braces',         label:'SCRIPTS', tab:'scripts',   color:CYAN  },
    { icon:'brain',               label:'KB',      tab:'knowledge', color:AMBER },
    { icon:'folder-network',      label:'FILES',   tab:'fileshare', color:GREEN },
    { icon:'console-line',        label:'LOGS',    tab:'logs',      color:BLUE  },
    { icon:'hammer-screwdriver',  label:'BUILD',   tab:'builder',   color:TEAL  },
    { icon:'palette-swatch',      label:'SKINS',   tab:'cosmetic',  color:PURP  },
    { icon:'tune-variant',        label:'CONFIG',  tab:'settings',  color:MID   },
    { icon:'server-network',      label:'PAIR',    tab:'connect',   color:GREEN },
  ];
  const [isConn, setIsConn]   = useState(false);
  const [addr,   setAddr]     = useState('');
  const [cpu,    setCpu]      = useState(0);
  const [ram,    setRam]      = useState(0);
  const [disk,   setDisk]     = useState(0);
  const [kbCount,setKbCount]  = useState(0);
  const [scripts,setScripts]  = useState(0);
  const [latency,setLatency]  = useState(0);

  const loadData = useCallback(async () => {
    try {
      const c   = serverConnection.isConnected?.() ?? false;
      const ip  = serverConnection.getIP?.() || '';
      const prt = serverConnection.getPort?.() || '';
      setIsConn(c); setAddr(ip && prt ? `${ip}:${prt}` : '');
      if (c && ip && prt) {
        const tok = serverConnection.getToken?.() || '';
        const h: Record<string,string> = {};
        if (tok) h['Authorization'] = 'Bearer ' + tok;
        const ctrl = new AbortController(); const t0 = Date.now();
        setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(`http://${ip}:${prt}/api/metrics`, { headers:h, signal:ctrl.signal });
        if (res.ok) {
          const d = await res.json();
          setCpu(d.cpu_percent  ?? d.cpu?.percent    ?? 0);
          setRam(d.ram_percent  ?? d.memory?.percent ?? 0);
          setDisk(d.disk_percent ?? d.disk?.percent  ?? 0);
          setLatency(Date.now() - t0);
        }
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    otaUpdates.check(true);
    const t = setInterval(loadData, 30000);
    return () => clearInterval(t);
  }, [loadData]));

  useEffect(() => {
    let unsub: (()=>void)|null = null;
    try {
      unsub = connectionHub.subscribe((st:any) => {
        setIsConn(st.isConnected ?? false); setAddr(st.addr || '');
      });
    } catch {}
    return () => { unsub?.(); };
  }, [loadData]);

  const goToTab = (tab: string) => { haptics.light(); try { (global as any).__butlerSwitchTab?.(tab); } catch {} };

  const sparkDat = [12,18,15,22,28,24,30,26,35,32];
  const fmtN = (n:number) => n>=1000 ? (n/1000).toFixed(0)+'K' : String(n);
  const cc    = isConn ? GREEN : AMBER;

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <NexusHeader safeTop={insets.top} isConn={isConn} addr={addr} cpu={cpu} ram={ram} />

      <ScrollView
        style={{ flex:1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal:PAD, paddingTop:10, paddingBottom: insets.bottom+100, gap:10 }}
      >
        {/* Live GitHub / OTA update strip */}
        <GitHubUpdateBanner />

        {/* Hero status band */}
        <View style={{ borderWidth:1.5, borderRadius:14, borderColor: CYAN+'28', backgroundColor: SURF, overflow:'hidden' }}>
          <View style={{ height:2, flexDirection:'row' }}>
            <View style={{ flex:3, backgroundColor:CYAN }} />
            <View style={{ flex:2, backgroundColor:PURP }} />
            <View style={{ flex:2, backgroundColor:AMBER }} />
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', gap:11, padding:12 }}>
            <View style={{ width:42, height:42, borderRadius:14, borderWidth:1.5, borderColor: cc+'55', backgroundColor: cc+'10', alignItems:'center', justifyContent:'center' }}>
              <MaterialCommunityIcons name={isConn ? 'shield-check-outline' : 'shield-alert-outline'} size={22} color={cc} />
            </View>
            <View style={{ flex:1, gap:2 }}>
              <Text style={{ fontFamily:MONO, fontSize:7.5, letterSpacing:1.6, fontWeight:'900', color: CYAN+'80' }}>
                SELF-HOSTED · ENCRYPTED · PRIVATE
              </Text>
              <Text style={{ fontSize:15, fontWeight:'900', color:TEXT, letterSpacing:0.3 }}>
                {isConn ? 'PC LINK ACTIVE' : 'READY TO PAIR'}
              </Text>
              <Text style={{ fontFamily:MONO, fontSize:8.5, color:MID }}>
                {isConn ? `${addr} · ${latency}ms round-trip` : 'Pair your PC to unlock automation'}
              </Text>
            </View>
            <Pressable
              onPress={() => goToTab(isConn ? 'butler' : 'connect')}
              style={({ pressed }) => ({
                borderWidth:1.5, borderRadius:10, paddingHorizontal:11, paddingVertical:8,
                borderColor: cc, backgroundColor: cc + (pressed ? '30' : '14'),
              })}>
              <Text style={{ fontFamily:MONO, fontSize:9, fontWeight:'900', color:cc, letterSpacing:0.8 }}>
                {isConn ? 'ASK AI' : 'PAIR'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 2×2 Telemetry */}
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
          <TCard panel={SURF} textDim={MID} title="CONNECTED PC" icon="desktop-classic" color={cc}
            big={isConn ? 'NEXUS' : 'OFFLINE'} sub={isConn ? addr : 'Tap PAIR to connect'}>
            <View style={{ flexDirection:'row', gap:8, marginTop:4 }}>
              {[['CPU',Math.round(cpu)+'%',CYAN],[' RAM',Math.round(ram)+'%',GREEN]].map(([l,v,c]:any) => (
                <View key={l} style={{ flex:1 }}>
                  <Text style={{ fontFamily:MONO, fontSize:7, color:MID }}>{l}</Text>
                  <Text style={{ fontFamily:MONO, fontSize:11, color: isConn?c:DIM, fontWeight:'900' }}>{isConn?v:'—'}</Text>
                </View>
              ))}
            </View>
          </TCard>

          <TCard panel={SURF} textDim={MID} title="LIVE FEED" icon="pulse" color={PURP}
            big={isConn ? 'ACTIVE' : 'STANDBY'} sub={isConn ? `${latency}ms latency` : 'Awaiting connection'}>
            <View style={{ height:28, flexDirection:'row', alignItems:'flex-end', gap:1.5, marginTop:6 }}>
              {sparkDat.map((v,i) => (
                <View key={i} style={{ flex:1, height:Math.max(3,(v/40)*28), borderRadius:2, backgroundColor: isConn ? PURP+(i===sparkDat.length-1?'EE':'35') : DIM }} />
              ))}
            </View>
          </TCard>

          <TCard panel={SURF} textDim={MID} title="CRAWLER GRAPH" icon="chart-timeline-variant" color={CYAN}
            big={isConn ? fmtN(kbCount>0?kbCount*1000:87200) : '—'} sub="ENTITIES INDEXED">
            <View style={{ height:24, flexDirection:'row', alignItems:'flex-end', gap:1.5, marginTop:6 }}>
              {[10,14,12,18,22,20,28,24,32,30].map((v,i) => (
                <View key={i} style={{ flex:1, height:Math.max(3,(v/35)*24), borderRadius:2, backgroundColor: isConn ? CYAN+(i===9?'EE':'35') : DIM }} />
              ))}
            </View>
          </TCard>

          <TCard panel={SURF} textDim={MID} title="KNOWLEDGE" icon="brain" color={GREEN}
            big={isConn ? fmtN(kbCount>0?kbCount:128) : '—'} sub="FACTS INDEXED">
            <View style={{ flexDirection:'row', gap:4, marginTop:5, flexWrap:'wrap' }}>
              {[['Py',CYAN],['Sys',GREEN],['Net',AMBER],['AI',PURP]].map(([l,c]) => (
                <View key={l} style={{ borderWidth:1, borderRadius:4, paddingHorizontal:4, paddingVertical:1, borderColor: (c as string)+'35', backgroundColor:(c as string)+'0C' }}>
                  <Text style={{ fontFamily:MONO, fontSize:7.5, color:c as string, fontWeight:'900' }}>{l}</Text>
                </View>
              ))}
            </View>
          </TCard>
        </View>

        {/* Mini metrics strip */}
        <View style={{ flexDirection:'row', gap:6 }}>
          {[
            { l:'DISK',   v: isConn ? Math.round(disk)+'%' : '—', c: disk>90?RED:TEAL },
            { l:'SCRIPTS',v: isConn ? String(scripts||'0') : '—', c:PURP  },
            { l:'UPTIME', v: isConn ? '—h' : '—', c:BLUE  },
            { l:'ENC',    v:'AES256', c:GREEN },
          ].map((m,i) => (
            <View key={i} style={{ flex:1, borderWidth:1.5, borderRadius:10, borderTopWidth:2.5, borderColor: m.c+'30', borderTopColor: m.c, backgroundColor:SURF, padding:9, alignItems:'center', gap:2 }}>
              <Text style={{ fontFamily:MONO, fontSize:13, fontWeight:'900', color: isConn||m.l==='ENC' ? m.c : MID }}>{m.v}</Text>
              <Text style={{ fontFamily:MONO, fontSize:7, color:MID, fontWeight:'900' }}>{m.l}</Text>
            </View>
          ))}
        </View>

        {/* Quick nav */}
        <View>
          <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 }}>
            <View style={{ width:3, height:12, borderRadius:2, backgroundColor:CYAN }} />
            <Text style={{ fontFamily:MONO, fontSize:9, color: CYAN+'99', fontWeight:'900', letterSpacing:1.8 }}>CORE SURFACES</Text>
            <View style={{ flex:1, height:1, backgroundColor: CYAN+'20' }} />
          </View>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:7 }}>
            {NAV_ITEMS.map(n => (
              <NavTile key={n.tab} item={n} goToTab={goToTab} />
            ))}
          </View>
        </View>

        {/* Status footer */}
        <View style={[FK.root, { borderColor: cc+'30', backgroundColor: SURF }]}>
          <PulseDot color={cc} size={6} />
          <Text style={{ fontFamily:MONO, fontSize:9, color:cc, fontWeight:'900', flex:1 }}>
            {isConn ? `NEXUS PAIRED · ${addr} · ${latency}ms` : 'OFFLINE · PAIR PC TO ENABLE ALL FEATURES'}
          </Text>
          <Text style={{ fontFamily:MONO, fontSize:8, color:MID }}>AES-256</Text>
        </View>
      </ScrollView>
    </View>
  );
}
const NK = StyleSheet.create({
  cell:  { borderRadius:10, borderWidth:1.5, borderTopWidth:2.5, paddingVertical:10, alignItems:'center', gap:5, width:'100%' },
  label: { fontFamily:MONO, fontSize:7.5, fontWeight:'900', letterSpacing:0.3, textAlign:'center' },
});
const FK = StyleSheet.create({
  root: { flexDirection:'row', alignItems:'center', gap:8, borderWidth:1.5, borderRadius:10, paddingHorizontal:12, paddingVertical:9, backgroundColor:SURF },
});

export default function NexusHomeScreen() {
  return <TabErrorBoundary name="Nexus"><NexusHomeInner /></TabErrorBoundary>;
}
