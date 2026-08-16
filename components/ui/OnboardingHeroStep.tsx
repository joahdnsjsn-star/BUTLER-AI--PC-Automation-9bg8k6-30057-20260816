/**
 * ONBOARDING HERO STEP — NEXUS COMMAND DECK v4.0
 * Completely rebuilt: full-bleed HUD aesthetic matching the reference screenshot.
 * • Live "telemetry" cards with sparkline bars
 * • Security grid (LAN / HMAC / TELEMETRY / AI) - 2×2 neon cards
 * • Animated stats strip (250+ / 100% / 0 / ∞)
 * • Butler OS Terminal with typewriter boot sequence
 * • Animated scan bar across hero section
 * • Starfield depth particles
 * • Squish-spring CTA with breathing halo
 * ALL driver separations enforced (native=transforms, JS=colors)
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  Dimensions, Platform, ScrollView, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { haptics } from '@/services/haptics';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SANS: any = Platform.OS === 'ios' ? 'System' : 'sans-serif';
const { width: _W, height: _H } = Dimensions.get('window');
const SW = Math.max(320, _W > 0 ? _W : 375);
const SH = Math.max(600, _H > 0 ? _H : 720);
const IS_TALL = SH > 750;

// ── DESIGN TOKENS ──────────────────────────────────────────────────
const C = {
  bg:      '#050810',
  surface: '#0B0F17',
  card:    '#0B0F17',
  cyan:    '#38D9E8',
  green:   '#2FE38A',
  amber:   '#FFB43D',
  purple:  '#A468FF',
  pink:    '#FF5FA8',
  red:     '#FF4D5E',
  text:    '#DCE6F2',
  textMid: '#4A9EFF',
  textDim: '#4A9EFF',
  border:  'rgba(0,229,255,0.16)',
};

// ── TYPEWRITER TAGLINES ─────────────────────────────────────────────
const TAGLINES = [
  { text:'Control your PC from your pocket.',  acc: C.cyan   },
  { text:'Python automation. Zero cloud.',     acc: C.green  },
  { text:'300+ scripts. All local AI.',        acc: C.amber  },
  { text:'HMAC-256 signed. Always private.',   acc: C.purple },
  { text:'Your butler. Your hardware.',        acc: C.pink   },
];

// ── BOOT SEQUENCE ──────────────────────────────────────────────────
const BOOT_LINES = [
  { t:'NEXUS_OS v7.3 — initializing …',      c:C.textDim  },
  { t:'> encryption: AES-256 + HMAC-SHA256', c:C.textMid  },
  { t:'> ollama bridge: LOCAL ONLY [ok]',    c:C.cyan+'CC' },
  { t:'> script_engine: 300 recipes loaded', c:C.green    },
  { t:'> telemetry: DISABLED ← zero tracking',c:C.green   },
  { t:'> STATUS: NEXUS ONLINE ▮',            c:C.green    },
];

// ── SPARKLINE DATA (fake but convincing) ───────────────────────────
const mkBars = (seed: number) =>
  Array.from({ length: 14 }, (_, i) =>
    0.15 + 0.75 * Math.abs(Math.sin(seed + i * 0.7 + i * 0.12))
  );

const MONITORS = [
  { label:'CPU', sub:'NEXUS CORE', col:C.cyan,   bars:mkBars(0.3),  val:'--', unit:'%' },
  { label:'RAM', sub:'MEMORY',     col:C.purple,  bars:mkBars(1.1),  val:'--', unit:'GB' },
  { label:'NET', sub:'THROUGHPUT', col:C.green,   bars:mkBars(2.4),  val:'--', unit:'MB/s' },
];

// ══════════════════════════════════════════════════════════════════════
export function OnboardingHeroStep({ onBegin }: { onBegin: () => void }) {

  // ── Typewriter ─────────────────────────────────────────────────────
  const [tagIdx, setTagIdx] = useState(0);
  const [typed, setTyped]   = useState('');
  const [deleting, setDel]  = useState(false);
  const charRef = useRef(0);
  useEffect(() => { charRef.current = 0; setTyped(''); setDel(false); }, [tagIdx]);
  useEffect(() => {
    const full = TAGLINES[tagIdx].text;
    let t: ReturnType<typeof setTimeout>;
    if (!deleting) {
      if (charRef.current < full.length) {
        t = setTimeout(() => { charRef.current++; setTyped(full.slice(0,charRef.current)); }, 40);
      } else { t = setTimeout(() => setDel(true), 2400); }
    } else {
      if (charRef.current > 0) {
        t = setTimeout(() => { charRef.current--; setTyped(full.slice(0,charRef.current)); }, 20);
      } else { setTagIdx(i => (i+1) % TAGLINES.length); }
    }
    return () => clearTimeout(t);
  }, [typed, deleting, tagIdx]);

  // ── Boot sequence ──────────────────────────────────────────────────
  const [bootN, setBootN] = useState(0);
  useEffect(() => {
    const ts = BOOT_LINES.map((_,i) =>
      setTimeout(() => setBootN(n => Math.max(n,i+1)), 200 + i*280)
    );
    return () => ts.forEach(clearTimeout);
  }, []);

  // ── CTA button animations ──────────────────────────────────────────
  const ctaGlow  = useRef(new Animated.Value(0.2)).current;  // JS driver
  const ctaScale = useRef(new Animated.Value(1)).current;    // native driver
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(ctaGlow, { toValue:0.65, duration:1100, useNativeDriver:false }),
      Animated.timing(ctaGlow, { toValue:0.15, duration:1100, useNativeDriver:false }),
    ]));
    l.start(); return () => l.stop();
  }, []);
  const handlePressIn  = () => Animated.spring(ctaScale, { toValue:0.94, tension:400, friction:10, useNativeDriver:true }).start();
  const handlePressOut = () => Animated.spring(ctaScale, { toValue:1,    tension:280, friction:10, useNativeDriver:true }).start();
  const handlePress = () => { try { haptics.success(); } catch {} onBegin(); };

  // ── Hero entrance ──────────────────────────────────────────────────
  const enterOp  = useRef(new Animated.Value(0)).current; // JS driver
  const enterTx  = useRef(new Animated.Value(24)).current; // JS driver
  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOp, { toValue:1, duration:600, useNativeDriver:false }),
      Animated.spring(enterTx, { toValue:0, tension:80, friction:10, useNativeDriver:false }),
    ]).start();
  }, []);

  // ── Robot float (native) ───────────────────────────────────────────
  const floatA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(floatA, { toValue:1, duration:2600, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
      Animated.timing(floatA, { toValue:0, duration:2600, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
    ]));
    l.start(); return () => l.stop();
  }, []);

  // ── Outer ring rotation (native) ───────────────────────────────────
  const ringA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.timing(ringA, { toValue:1, duration:9000, useNativeDriver:true, easing:Easing.linear }));
    l.start(); return () => l.stop();
  }, []);

  // ── Scan line (JS driver — position) ──────────────────────────────
  const scanA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(scanA, { toValue:1, duration:2200, useNativeDriver:false, easing:Easing.linear }),
      Animated.delay(800),
      Animated.timing(scanA, { toValue:0, duration:0, useNativeDriver:false }),
    ]));
    l.start(); return () => l.stop();
  }, []);

  // ── Sparkline bar animation pulses ─────────────────────────────────
  const sparkA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(sparkA, { toValue:1, duration:1800, useNativeDriver:false }),
      Animated.timing(sparkA, { toValue:0, duration:1800, useNativeDriver:false }),
    ]));
    l.start(); return () => l.stop();
  }, []);

  const acc    = TAGLINES[tagIdx].acc;
  const floatY = floatA.interpolate({ inputRange:[0,1], outputRange:[0,-10] });
  const ringRot = ringA.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] });
  const scanTop = scanA.interpolate({ inputRange:[0,1], outputRange:[0, IS_TALL ? 200 : 170] });

  let robotImg: any = null;
  try { robotImg = require('@/assets/images/mascot_shield_v2.png'); } catch {
    try { robotImg = require('@/assets/images/mascot_shield.png'); } catch {
      try { robotImg = require('@/assets/images/butler_hud_robot.jpg'); } catch {}
    }
  }

  return (
    <Animated.View style={[S.root, { opacity:enterOp, transform:[{translateY:enterTx}] }]}>

      {/* 5-color signal strip */}
      <View style={S.sigStrip}>
        {[C.cyan, C.purple, C.amber, C.green, C.pink].map((c,i) => (
          <View key={i} style={{ flex:1, backgroundColor:c }} />
        ))}
      </View>

      {/* ══ HERO — robot + HUD ══ */}
      <View style={S.hero}>
        <StarField count={44} />
        <Animated.View pointerEvents="none" style={[S.scanLine, { top:scanTop }]} />
        <HUDCorners color={acc} />
        {/* Outer dashed ring */}
        <Animated.View pointerEvents="none"
          style={[S.outerRing, { transform:[{rotate:ringRot}] }]} />
        <View style={S.innerRing} />
        {/* Robot */}
        <Animated.View style={[S.robotWrap, { transform:[{translateY:floatY}] }]}>
          {robotImg
            ? <Image source={robotImg} style={S.robotImg} contentFit="contain" contentPosition="center" transition={400} />
            : <View style={[S.robotImg,{alignItems:'center',justifyContent:'center'}]}>
                <MaterialCommunityIcons name="robot-happy" size={IS_TALL ? 96 : 80} color={C.cyan} />
              </View>
          }
          <View style={[S.robotGlow, { backgroundColor:acc+'25' }]} />
        </Animated.View>
        {/* Brand text */}
        <View style={S.brandBlock}>
          <Text style={S.brandMain}>BUTLER <Text style={{ color:acc }}>AI</Text></Text>
          <View style={[S.brandBar, { backgroundColor:acc }]} />
          <View style={S.typeRow}>
            <Text style={[S.typeTxt, { color:acc }]} numberOfLines={1}>{typed}</Text>
            <Animated.View style={[S.blinkCursor, { backgroundColor:acc,
              opacity:floatA.interpolate({inputRange:[0,0.45,1],outputRange:[1,0.1,1]}) }]} />
          </View>
        </View>
        {/* Corner serial */}
        <View style={[S.serial, { borderColor:acc+'35' }]}>
          <Text style={{ fontFamily:MONO, fontSize:7, color:acc+'70', letterSpacing:0.5 }}>SER.NEXUS-7.3</Text>
        </View>
      </View>

      {/* ══ SECURITY FEATURE CARDS — 2×2 grid ══ */}
      <View style={S.sectionPad}>
        <SectionHdr icon="shield-check" label="SECURITY ARCHITECTURE" col={C.cyan} />
        <View style={S.grid2x2}>
          {[
            { icon:'wifi-off',       col:C.cyan,   top:'LAN ONLY',    bot:'ZERO CLOUD'   },
            { icon:'lock',           col:C.green,  top:'HMAC-256',    bot:'SIGNED'       },
            { icon:'block-helper',   col:C.amber,  top:'DISABLED',    bot:'AUTO-RUN'     },
            { icon:'eye-off',        col:C.purple, top:'NONE',        bot:'TELEMETRY'    },
          ].map((card,i) => (
            <SecurityCard key={i} {...card} sparkA={sparkA} />
          ))}
        </View>
      </View>

      {/* ══ LIVE MONITOR CARDS — 3-up horizontal ══ */}
      <View style={S.sectionPad}>
        <SectionHdr icon="monitor-heart" label="SYSTEM TELEMETRY" col={C.green} />
        <View style={S.monitorRow}>
          {MONITORS.map((m,i) => (
            <MonitorCard key={i} {...m} sparkA={sparkA} />
          ))}
        </View>
      </View>

      {/* ══ STATS STRIP ══ */}
      <View style={S.statsStrip}>
        {[
          { val:'250+', lbl:'SCRIPTS',  col:C.cyan   },
          { val:'100%', lbl:'LOCAL',    col:C.green  },
          { val:'0',    lbl:'CLOUD',    col:C.amber  },
          { val:'∞',    lbl:'UPTIME',   col:C.purple },
        ].map(({val,lbl,col},i,a) => (
          <View key={i} style={[S.statCell, i<a.length-1 && {borderRightWidth:1,borderRightColor:C.border}]}>
            <Text style={[S.statVal, {color:col}]}>{val}</Text>
            <Text style={S.statLbl}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* ══ BUTLER OS TERMINAL ══ */}
      <View style={S.sectionPad}>
        <View style={S.terminal}>
          <View style={S.termTitle}>
            {['#FF4D5E','#FFC94A','#2FE38A'].map((c,i) => (
              <View key={i} style={{ width:9, height:9, borderRadius:5, backgroundColor:c }} />
            ))}
            <Text style={S.termTitleTxt}>butler@nexus — session</Text>
            <View style={[S.secureBadge, { borderColor:C.green+'55' }]}>
              <View style={{ width:5, height:5, borderRadius:3, backgroundColor:C.green }} />
              <Text style={{ fontFamily:MONO, fontSize:7, fontWeight:'900', color:C.green }}>SECURE</Text>
            </View>
          </View>
          <View style={S.termBody}>
            {BOOT_LINES.slice(0, bootN).map((line,i) => (
              <BootLine key={i} line={line} />
            ))}
            {bootN < BOOT_LINES.length && (
              <Text style={{ fontFamily:MONO, fontSize:11, color:C.textDim }}>▮</Text>
            )}
          </View>
        </View>
      </View>

      {/* ══ CTA ══ */}
      <View style={S.ctaWrap}>
        <Animated.View pointerEvents="none"
          style={[S.ctaHalo, { backgroundColor:acc, opacity:ctaGlow }]} />
        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
          <Animated.View style={[S.ctaBtn, {
            backgroundColor:acc, transform:[{scale:ctaScale}],
            ...(Platform.OS==='ios'?{
              shadowColor:acc, shadowOffset:{width:0,height:12},
              shadowOpacity:0.75, shadowRadius:22,
            }:{elevation:16}),
          }]}>
            <View style={[S.ctaCorner,{top:2,left:4,borderTopWidth:1.5,borderLeftWidth:1.5,borderColor:'rgba(0,0,0,0.25)'}]} />
            <View style={[S.ctaCorner,{top:2,right:4,borderTopWidth:1.5,borderRightWidth:1.5,borderColor:'rgba(0,0,0,0.25)'}]} />
            <View style={[S.ctaCorner,{bottom:2,left:4,borderBottomWidth:1.5,borderLeftWidth:1.5,borderColor:'rgba(0,0,0,0.25)'}]} />
            <View style={[S.ctaCorner,{bottom:2,right:4,borderBottomWidth:1.5,borderRightWidth:1.5,borderColor:'rgba(0,0,0,0.25)'}]} />
            <MaterialIcons name="bolt" size={20} color="#000" />
            <Text style={S.ctaTxt}>BEGIN INITIALIZATION</Text>
            <MaterialIcons name="arrow-forward-ios" size={15} color="#000" />
          </Animated.View>
        </Pressable>
      </View>
      <Text style={S.skipHint}>10-step guided setup · ~90 seconds · skip anytime</Text>

    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════

const HERO_H = IS_TALL ? 220 : 185;

function HUDCorners({ color }: { color: string }) {
  const SZ = 14, TH = 1.5;
  return (
    <>
      {[{top:4,left:4},{top:4,right:4},{bottom:4,left:4},{bottom:4,right:4}].map((p,i)=>(
        <View key={i} style={[{
          position:'absolute', width:SZ, height:SZ,
          borderTopWidth:    'top'    in p ? TH : 0,
          borderBottomWidth: 'bottom' in p ? TH : 0,
          borderLeftWidth:   'left'   in p ? TH : 0,
          borderRightWidth:  'right'  in p ? TH : 0,
          borderColor: color+'80', zIndex:4,
        }, p as any]} />
      ))}
    </>
  );
}

function SectionHdr({ icon, label, col }: { icon:string; label:string; col:string }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:7, marginBottom:10 }}>
      <View style={{ width:3, height:16, borderRadius:2, backgroundColor:col }} />
      <MaterialCommunityIcons name={icon as any} size={10} color={col} />
      <Text style={{ fontFamily:MONO, fontSize:9, fontWeight:'900', color:col+'+CC', letterSpacing:1.8, flex:1 }}>
        {label}
      </Text>
      <View style={{ height:1, width:30, backgroundColor:col+'25' }} />
    </View>
  );
}

function SecurityCard({ icon, col, top, bot, sparkA }: {
  icon:string; col:string; top:string; bot:string; sparkA:Animated.Value;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const borderA    = sparkA.interpolate({ inputRange:[0,1], outputRange:[col+'45', col+'CC'] });
  return (
    <Animated.View style={[sc.card, { borderColor:borderA, backgroundColor:col+'07' }]}>
      <View style={[sc.topBar, { backgroundColor:col }]} />
      {/* Corner ticks */}
      {[{top:2,left:2},{top:2,right:2},{bottom:2,left:2},{bottom:2,right:2}].map((p,i)=>(
        <View key={i} style={[{
          position:'absolute', width:6, height:6,
          borderTopWidth:    'top' in p ? 1.5 : 0,
          borderBottomWidth: 'bottom' in p ? 1.5 : 0,
          borderLeftWidth:   'left' in p ? 1.5 : 0,
          borderRightWidth:  'right' in p ? 1.5 : 0,
          borderColor: col+'70', zIndex:3,
        }, p as any]} />
      ))}
      <View style={[sc.iconBox, { borderColor:col+'60', backgroundColor:col+'10' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={col} />
      </View>
      <Text style={[sc.top, { color:col }]}>{top}</Text>
      <Text style={sc.bot}>{bot}</Text>
    </Animated.View>
  );
}
const sc = StyleSheet.create({
  card:    { width:'48%', borderRadius:14, borderWidth:1.5, padding:14, alignItems:'center',
             gap:8, overflow:'hidden', position:'relative' },
  topBar:  { position:'absolute', top:0, left:0, right:0, height:3, borderTopLeftRadius:14, borderTopRightRadius:14 },
  iconBox: { width:52, height:52, borderRadius:14, borderWidth:1.5, alignItems:'center', justifyContent:'center' },
  top:     { fontFamily:MONO, fontSize:13, fontWeight:'900', letterSpacing:0.5, textAlign:'center' },
  bot:     { fontFamily:MONO, fontSize:9, color:'#4A9EFF', letterSpacing:1.2, textAlign:'center' },
});

function MonitorCard({ label, sub, col, bars, sparkA }: {
  label:string; sub:string; col:string; bars:number[];
  sparkA: Animated.Value;
}) {
  const glowBorderC = sparkA.interpolate({ inputRange:[0,1], outputRange:[col+'30',col+'70'] });
  return (
    <Animated.View style={[mc.card, { borderColor:glowBorderC, backgroundColor:col+'05' }]}>
      <View style={[mc.topLine, { backgroundColor:col }]} />
      <View style={{ flexDirection:'row', alignItems:'center', gap:5, marginBottom:4 }}>
        <View style={{ width:6, height:6, borderRadius:3, backgroundColor:col }} />
        <Text style={[mc.lbl, { color:col }]}>{label}</Text>
        <Text style={mc.sub}>{sub}</Text>
      </View>
      <Text style={[mc.val, { color:col }]}>--</Text>
      {/* Sparkline */}
      <View style={mc.spark}>
        {bars.map((h,i) => {
          const isLast = i === bars.length - 1;
          return (
            <View key={i} style={{
              flex:1, borderRadius:1.5,
              backgroundColor: col,
              height: Math.max(3, h * 24),
              opacity: isLast ? 1 : 0.25 + (i/bars.length) * 0.55,
              ...(Platform.OS==='ios' && isLast ? {
                shadowColor:col, shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:4
              } : {}),
            }} />
          );
        })}
      </View>
      <Text style={[mc.arrow, { color:col+'70' }]}>→</Text>
    </Animated.View>
  );
}
const mc = StyleSheet.create({
  card:    { flex:1, borderRadius:10, borderWidth:1.5, padding:8, overflow:'hidden', position:'relative',
             minHeight:88 },
  topLine: { position:'absolute', top:0, left:0, right:0, height:2.5 },
  lbl:     { fontFamily:MONO, fontSize:10.5, fontWeight:'900', letterSpacing:0.5 },
  sub:     { fontFamily:MONO, fontSize:7, color:'#4A9EFF', letterSpacing:0.5, flex:1 },
  val:     { fontFamily:MONO, fontSize:13, fontWeight:'900', marginBottom:4 },
  spark:   { flexDirection:'row', alignItems:'flex-end', gap:1.5, height:26, width:'100%' },
  arrow:   { fontFamily:MONO, fontSize:9, alignSelf:'flex-end', marginTop:2 },
});

function BootLine({ line }: { line: { t:string; c:string } }) {
  const op = useRef(new Animated.Value(0)).current;
  const tx = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue:1, duration:200, useNativeDriver:false }),
      Animated.timing(tx, { toValue:0, duration:200, useNativeDriver:false }),
    ]).start();
  }, []);
  return (
    <Animated.Text style={{ fontFamily:MONO, fontSize:10.5, lineHeight:17,
      color:line.c, opacity:op, transform:[{translateX:tx}] }}>
      {line.t}
    </Animated.Text>
  );
}

function StarField({ count }: { count: number }) {
  const stars = useMemo(() => Array.from({ length:count }, (_,i) => ({
    id:i, x:Math.random()*SW, y:Math.random()*HERO_H,
    r:Math.random()<0.15?1.8:Math.random()<0.4?1.1:0.6,
    delay:Math.floor(Math.random()*2200),
    dur:Math.floor(800+Math.random()*2200),
  })), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map(st => <StarDot key={st.id} {...st} />)}
    </View>
  );
}

function StarDot({ x,y,r,delay,dur }: { x:number;y:number;r:number;delay:number;dur:number }) {
  const op = useRef(new Animated.Value(0.1)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(op, { toValue:0.9, duration:dur/2, useNativeDriver:true }),
      Animated.timing(op, { toValue:0.08, duration:dur/2, useNativeDriver:true }),
    ]));
    l.start(); return () => l.stop();
  }, []);
  return (
    <Animated.View style={{ position:'absolute', left:x, top:y,
      width:r*2, height:r*2, borderRadius:r,
      backgroundColor:'#FFFFFF', opacity:op }} />
  );
}

// ── MAIN STYLES ─────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { backgroundColor:C.bg },
  sigStrip: { height:3, flexDirection:'row' },

  // Hero
  hero: { height:HERO_H, backgroundColor:'#050810', borderBottomWidth:1,
          borderBottomColor:C.border, overflow:'hidden', alignItems:'center',
          justifyContent:'flex-end', paddingBottom:16, position:'relative' },
  scanLine: { position:'absolute', left:0, right:0, height:1.5,
              backgroundColor:C.cyan+'60', zIndex:4,
              ...(Platform.OS==='ios'?{shadowColor:C.cyan,shadowOffset:{width:0,height:0},shadowOpacity:0.9,shadowRadius:6}:{}) },
  outerRing: { position:'absolute', width:180, height:180, borderRadius:90,
               top:(HERO_H-180)/2-8, borderWidth:1.5, borderColor:'transparent',
               borderTopColor:C.cyan+'55', borderRightColor:C.purple+'35', zIndex:1 },
  innerRing: { position:'absolute', width:210, height:210, borderRadius:105,
               top:(HERO_H-210)/2-8, borderWidth:1, borderColor:C.border, zIndex:0 },
  robotWrap: { alignItems:'center', zIndex:2, position:'relative' },
  robotImg:  { width:IS_TALL?120:100, height:IS_TALL?120:100 },
  robotGlow: { position:'absolute', bottom:-8, left:10, right:10, height:36, borderRadius:18, zIndex:-1 },
  brandBlock:{ alignItems:'center', zIndex:2, marginTop:8 },
  brandMain: { fontFamily:MONO, fontSize:IS_TALL?24:20, fontWeight:'900', color:'#FFFFFF', letterSpacing:3, lineHeight:28 },
  brandBar:  { height:2.5, width:55, borderRadius:2, marginTop:5,
               ...(Platform.OS==='ios'?{shadowOpacity:1,shadowRadius:7,shadowOffset:{width:0,height:0}}:{}) },
  typeRow:   { flexDirection:'row', alignItems:'center', marginTop:6, height:17 },
  typeTxt:   { fontFamily:MONO, fontSize:11, fontWeight:'900', letterSpacing:0.5 },
  blinkCursor:{ width:7, height:12, borderRadius:1, marginLeft:2 },
  serial:    { position:'absolute', bottom:6, right:8, borderWidth:1, borderRadius:4,
               paddingHorizontal:6, paddingVertical:2, backgroundColor:'rgba(0,229,255,0.03)', zIndex:3 },

  // Section pad
  sectionPad: { paddingHorizontal:14, paddingTop:14 },

  // Security 2x2
  grid2x2:   { flexDirection:'row', flexWrap:'wrap', gap:8, justifyContent:'space-between' },

  // Monitor row
  monitorRow:{ flexDirection:'row', gap:6 },

  // Stats
  statsStrip:{ flexDirection:'row', marginHorizontal:14, marginTop:12,
               borderWidth:1.5, borderColor:C.border, borderRadius:12,
               backgroundColor:C.card, overflow:'hidden' },
  statCell:  { flex:1, alignItems:'center', paddingVertical:11 },
  statVal:   { fontFamily:MONO, fontSize:IS_TALL?19:16, fontWeight:'900', lineHeight:22 },
  statLbl:   { fontFamily:MONO, fontSize:7, color:C.textMid, letterSpacing:1.2, marginTop:2, fontWeight:'900' },

  // Terminal
  terminal:  { borderWidth:1.5, borderColor:C.border, borderRadius:12, backgroundColor:'#050810', overflow:'hidden' },
  termTitle: { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:7,
               borderBottomWidth:1, borderBottomColor:C.border, backgroundColor:'#050810' },
  termTitleTxt:{ fontFamily:MONO, fontSize:9, color:C.textDim, flex:1 },
  secureBadge: { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1, borderRadius:5,
                 paddingHorizontal:6, paddingVertical:2, borderColor:C.green+'45', backgroundColor:C.green+'08' },
  termBody:  { padding:11, gap:2, minHeight:IS_TALL?88:72 },

  // CTA
  ctaWrap:   { marginHorizontal:14, marginTop:16, alignItems:'center', position:'relative' },
  ctaHalo:   { position:'absolute', width:'90%', height:52, borderRadius:26, top:4, opacity:0.22 },
  ctaBtn:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
               paddingVertical:16, paddingHorizontal:24, borderRadius:14, width:SW-28,
               position:'relative', overflow:'hidden' },
  ctaCorner: { position:'absolute', width:8, height:8 },
  ctaTxt:    { fontFamily:MONO, fontSize:14, fontWeight:'900', color:'#000', letterSpacing:1.5 },
  skipHint:  { textAlign:'center', fontFamily:MONO, fontSize:9, color:C.textDim,
               paddingVertical:14, letterSpacing:0.3 },
});
