/**
 * BUTLER AI — NEXUS ONBOARDING v9.2 ★ RACE-FIX ★
 *
 * ARCHITECTURE SAFETY RULES (DO NOT VIOLATE):
 *  • NO top-level expo-camera import — causes Android cold-start crash
 *  • NO top-level singleton service imports (autoConnectEngine, serverConnection)
 *  • Animated, react-native-svg, expo-image are ALL safe — proven in nexushome.tsx
 *  • useNativeDriver: false everywhere (Hermes JS/native node mixing prevention)
 *  • All persistence via AsyncStorage multiSet — never raw writes elsewhere
 *
 * NAVIGATION CONTRACT:
 *  SKIP → writes all keys → notifyOnboardingComplete() → navigates away
 *  FINISH → writes all keys → notifyOnboardingComplete() → navigates away
 *  BACK → goes to previous page (no keys written)
 *  NEXT → goes to next page (no keys written, except consent gating on p3/p4)
 *
 * NOTE: This screen no longer contains a useFocusEffect redirect guard.
 * The fix for returning users lives entirely in (tabs)/_layout.tsx, which
 * holds first paint until AsyncStorage resolves — so this screen is never
 * mounted for a returning user. Do NOT re-add a useFocusEffect redirect here.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
// Lazy-import so expo-camera / react-native-svg SVG internals (Defs, RadialGradient)
// are NOT evaluated during boot-time route-manifest loading — same Class A fix as QRCameraScanner.
const OnboardingHeroStep = React.lazy(() =>
  import('@/components/ui/OnboardingHeroStep').then(m => ({ default: m.OnboardingHeroStep }))
);
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Platform, Dimensions, ScrollView, TextInput, Alert, BackHandler, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { notifyOnboardingComplete } from './_layout';
import { markOnboardingDone } from '@/services/onboardingState';
import SecurityShowcase from '@/components/ui/SecurityShowcase';
import {
  ONBOARDING_DONE_KEY, CONSENT_KEY, TERMS_ACCEPTED_KEY,
  PRIVACY_ACCEPTED_KEY, AGE_CONFIRMED_KEY, LAN_CONSENT_KEY,
  REMOTE_EXEC_CONSENT_KEY, CAMERA_CONSENT_KEY,
  SERVER_PRIVACY_ACCEPTED_KEY,
} from '@/constants/onboardingKeys';
import { POST_ONBOARDING_CHAT_FLAG } from '@/components/ui/PostOnboardingChat';
import { haptics } from '@/services/haptics';
import AnimatedWireDefault, { WireCorner, HorizontalWire } from '@/components/ui/AnimatedWire';
import { TechGrid, TypewriterLine } from '@/components/ui/NexusFX';

const { width: SW, height: SH } = Dimensions.get('window');
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const ND = false; // useNativeDriver always false for safety

const TOTAL = 10;

// ─── PER-PAGE TIP DATA ────────────────────────────────────────────
const PAGE_TIPS: { title: string; body: string; icon: string; iconLib: 'material' | 'community' }[] = [
  { title: 'INIT SEQUENCE', body: 'Swipe left/right or tap NEXT. 10 steps total — skip any time.', icon: 'rocket-launch', iconLib: 'community' },
  { title: '9 TABS',        body: 'Each tab is a separate superpower. Explore them all from HOME.', icon: 'view-dashboard-variant', iconLib: 'community' },
  { title: 'ALL REQUIRED',  body: 'Every checkbox is a real agreement — read before ticking.', icon: 'shield-check', iconLib: 'community' },
  { title: 'BINDING RULES', body: 'These six rules protect you legally. Violations void your licence.', icon: 'alert-octagon', iconLib: 'community' },
  { title: 'LEGAL DOCS',    body: 'Tap any card to read the full document. Required by Google Play.', icon: 'file-document', iconLib: 'community' },
  { title: 'ONLY 3',        body: 'Camera = QR scan only. Network = LAN only. Storage = opt-in.', icon: 'shield-lock', iconLib: 'community' },
  { title: 'QUICK ANSWERS', body: 'Tap any question to expand it. All answers are 100% honest.', icon: 'chat-question', iconLib: 'community' },
  { title: 'LOCAL SERVER',  body: 'butler_server.py runs on YOUR PC. We host zero servers.', icon: 'server', iconLib: 'community' },
  { title: 'PAIR IN 60s',   body: 'GitHub → install → run → scan QR. Most users done in 90 seconds.', icon: 'qr-code-scanner', iconLib: 'material' },
  { title: 'ALL SYSTEMS GO',body: 'Tap any tab icon below to enter your Nexus command center.', icon: 'rocket-launch', iconLib: 'community' },
];

// ─── DESIGN TOKENS ─────────────────────────────────────────────────
const T = {
  bg:       '#050810',
  surface:  '#0B0F17',
  surfHi:   '#4A9EFF',
  cyan:     '#38D9E8',
  cyanDim:  '#00E5FF18',
  green:    '#2FE38A',
  greenDim: '#00FF8812',
  amber:    '#FFB43D',
  amberDim: '#FFB02012',
  danger:   '#FF4D5E',
  dangerDim:'#FF333312',
  purple:   '#A468FF',
  purpleDim:'#CC44FF12',
  text:     '#DCE6F2',
  textMid:  '#4A9EFF',
  textDim:  '#4A9EFF',
  border:   'rgba(0,229,255,0.14)',
};

// ─── PAGE METADATA ─────────────────────────────────────────────────
const PAGES = [
  { accent: T.cyan,   icon: 'home-variant',         iconLib: 'community', label: 'WELCOME',     title: 'BUTLER AI',         sub: 'Your Local PC Command Centre' },
  { accent: T.cyan,   icon: 'view-dashboard-variant',iconLib: 'community', label: 'APP TOUR',    title: 'NINE POWERFUL TABS', sub: 'Every tool at your fingertips' },
  { accent: T.amber,  icon: 'shield-check',          iconLib: 'community', label: 'CONSENT',     title: 'SAFETY CONSENT',    sub: 'Required — all items must be checked' },
  { accent: T.danger, icon: 'robot',                 iconLib: 'community', label: 'PLEDGE',      title: 'SAFETY PLEDGE',     sub: 'Six rules that protect you and others' },
  { accent: T.cyan,   icon: 'file-document-multiple',iconLib: 'community', label: 'LEGAL',       title: 'LEGAL DOCUMENTS',   sub: 'Required for Google Play' },
  { accent: T.green,  icon: 'shield-lock',           iconLib: 'community', label: 'PERMISSIONS', title: 'PERMISSIONS',       sub: 'Only 3 — all explained honestly' },
  { accent: T.amber,  icon: 'chat-question',         iconLib: 'community', label: 'Q & A',       title: 'COMMON QUESTIONS',  sub: 'Everything you need to know' },
  { accent: T.green,  icon: 'server',                iconLib: 'community', label: 'SERVER',      title: 'SERVER PRIVACY',    sub: '100% local · transparent architecture' },
  { accent: T.purple, icon: 'robot-industrial',      iconLib: 'community', label: 'PC SETUP',    title: 'CONNECT YOUR PC',   sub: 'Three steps to pair in under 60 seconds' },
  { accent: T.green,  icon: 'rocket-launch',         iconLib: 'community', label: 'LAUNCH',      title: 'YOU ARE READY',     sub: 'All agreements saved · tap FINISH' },
];

// ─── PERSIST + COMPLETE ────────────────────────────────────────────
let _pendingCelebrationCb: (() => void) | null = null;
let _triggerCelebration:   (() => void) | null = null;

// Shared navigation helper — callable from anywhere including the error boundary
export function forceNavigateToHome() {
  const attempt = () => {
    try { router.replace('/(tabs)/nexushome' as any); return; } catch {}
    try {
      const fn = (global as any).__butlerSwitchTab;
      if (typeof fn === 'function') { fn('nexushome'); return; }
    } catch {}
    try { router.navigate('/(tabs)/nexushome' as any); } catch {}
  };
  attempt();
  setTimeout(attempt, 400);
  setTimeout(attempt, 1000);
  setTimeout(attempt, 2200);
}

async function persistAndComplete() {
  // Write all onboarding keys via the centralized service (atomic multiSet
  // with individual setItem fallback — never throws)
  await markOnboardingDone();

  // Also write the PostOnboardingChat flag
  try { await AsyncStorage.setItem(POST_ONBOARDING_CHAT_FLAG, '1'); } catch {}

  // Notify layout to flip isDone → true (shows full tab bar)
  try { notifyOnboardingComplete(); } catch {}
  // Also update the global step so _layout watchdog sees we're done
  try { (global as any).__butlerOnboardingStepIdx = -1; } catch {}

  // Haptic fanfare
  try {
    const { haptics: hp } = require('@/services/haptics');
    hp.medium();
    setTimeout(() => hp.medium(),  130);
    setTimeout(() => hp.heavy(),   270);
    setTimeout(() => hp.success(), 460);
    setTimeout(() => hp.success(), 650);
    setTimeout(() => hp.success(), 820);
  } catch {}

  const doNavigate = forceNavigateToHome;

  if (_triggerCelebration) {
    _pendingCelebrationCb = doNavigate;
    _triggerCelebration();
  } else {
    doNavigate();
  }
}

// ─── SCAN-LINE WIPE TRANSITION OVERLAY ──────────────────────────────
// A full-screen coloured panel that sweeps left→right during page changes.
// Triggered externally via a callback ref — fully decoupled from page content.
function ScanLineWipe({ triggerRef, color }: {
  triggerRef: React.MutableRefObject<((advancing: boolean, accent: string, cb: () => void) => void) | null>;
  color: string;
}) {
  const [active, setActive] = useState(false);
  const [wipeColor, setWipeColor] = useState(color);
  const translateX = useRef(new Animated.Value(-SW)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scanX      = useRef(new Animated.Value(0)).current;

  const trigger = useCallback((advancing: boolean, accent: string, cb: () => void) => {
    setWipeColor(accent);
    setActive(true);
    const startX = advancing ? -SW : SW;
    const midX   = 0;
    const exitX  = advancing ? SW : -SW;
    translateX.setValue(startX);
    opacity.setValue(0.92);
    scanX.setValue(0);

    // Phase 1: wipe IN (covers screen)
    Animated.timing(translateX, {
      toValue: midX, duration: 140, useNativeDriver: false,
    }).start(() => {
      // Fire content swap at peak coverage
      cb();
      // Scan line race across the panel
      Animated.timing(scanX, { toValue: 1, duration: 120, useNativeDriver: false }).start();
      // Phase 2: wipe OUT (reveals new content)
      Animated.sequence([
        Animated.delay(40),
        Animated.timing(translateX, { toValue: exitX, duration: 180, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: 60, useNativeDriver: false }),
      ]).start(() => setActive(false));
    });
  }, [translateX, opacity, scanX]);

  useEffect(() => { triggerRef.current = trigger; }, [trigger, triggerRef]);

  if (!active) return null;

  const scanLine = scanX.interpolate({ inputRange: [0, 1], outputRange: [-20, SW + 20] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {
        zIndex: 9000,
        opacity,
        transform: [{ translateX }],
        backgroundColor: wipeColor + '18',
        borderRightWidth: 3,
        borderRightColor: wipeColor,
        overflow: 'hidden',
      }]}
    >
      {/* Diagonal glitch stripes */}
      {[0.15, 0.35, 0.55, 0.75, 0.92].map((pct, i) => (
        <View key={i} pointerEvents="none" style={[
          { position: 'absolute', left: 0, right: 0, top: `${pct * 100}%` as any,
            height: i % 2 === 0 ? 2 : 1,
            backgroundColor: wipeColor,
            opacity: 0.3 + i * 0.12,
            transform: [{ skewX: '-4deg' }] },
        ]} />
      ))}
      {/* Fast scan beam */}
      <Animated.View pointerEvents="none" style={[
        StyleSheet.absoluteFill,
        { width: 24, backgroundColor: wipeColor, opacity: 0.22,
          transform: [{ translateX: scanLine as any }, { skewX: '-8deg' }] },
      ]} />
      {/* HUD corner brackets — top-left */}
      <View style={{ position:'absolute', top:12, left:12, width:16, height:16,
        borderTopWidth:2.5, borderLeftWidth:2.5, borderColor:wipeColor }} />
      <View style={{ position:'absolute', bottom:12, right:12, width:16, height:16,
        borderBottomWidth:2.5, borderRightWidth:2.5, borderColor:wipeColor }} />
    </Animated.View>
  );
}

// ─── INFO BUBBLE WITH ARROW ────────────────────────────────────────
// Pops up after each page transition. Points at the step pill (top-left).
// Auto-dismisses after 4.5 seconds or on tap.
function InfoBubble({ visible, pageIdx, accent, onDismiss }: {
  visible: boolean; pageIdx: number; accent: string; onDismiss: () => void;
}) {
  const scaleA = useRef(new Animated.Value(0)).current;
  const fadeA  = useRef(new Animated.Value(0)).current;
  const slideA = useRef(new Animated.Value(-14)).current;
  const tip    = PAGE_TIPS[Math.min(pageIdx, PAGE_TIPS.length - 1)];

  useEffect(() => {
    if (visible) {
      // Pop-in spring
      scaleA.setValue(0.4); fadeA.setValue(0); slideA.setValue(-10);
      Animated.parallel([
        Animated.spring(scaleA, { toValue: 1, tension: 320, friction: 14, useNativeDriver: false }),
        Animated.timing(fadeA,  { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.spring(slideA, { toValue: 0, tension: 280, friction: 18, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleA, { toValue: 0.6, duration: 160, useNativeDriver: false }),
        Animated.timing(fadeA,  { toValue: 0,   duration: 160, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  if (!visible && (scaleA as any).__getValue?.() === 0) return null;

  const Icon = tip.iconLib === 'community' ? MaterialCommunityIcons : MaterialIcons;

  return (
    <Animated.View
      style={[
        ib2.wrap,
        {
          opacity: fadeA,
          transform: [{ scale: scaleA }, { translateY: slideA }],
          borderColor: accent + '80',
          shadowColor: accent,
        },
      ]}
    >
      {/* Arrow pointing left toward the step pill */}
      <View style={[ib2.arrow, { borderRightColor: accent + '80' }]} />
      <View style={[ib2.arrowInner, { borderRightColor: '#0B0F17' }]} />

      {/* Scan accent line */}
      <View style={[ib2.topLine, { backgroundColor: accent }]} />

      {/* HUD corners */}
      <View style={{ position:'absolute', top:0, left:0, width:8, height:8, borderTopWidth:1.5, borderLeftWidth:1.5, borderColor:accent+'90' }} />
      <View style={{ position:'absolute', top:0, right:0, width:8, height:8, borderTopWidth:1.5, borderRightWidth:1.5, borderColor:accent+'90' }} />
      <View style={{ position:'absolute', bottom:0, left:0, width:8, height:8, borderBottomWidth:1.5, borderLeftWidth:1.5, borderColor:accent+'50' }} />
      <View style={{ position:'absolute', bottom:0, right:0, width:8, height:8, borderBottomWidth:1.5, borderRightWidth:1.5, borderColor:accent+'50' }} />

      <TouchableOpacity onPress={onDismiss} activeOpacity={0.9} style={ib2.content}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:5 }}>
          <View style={[ib2.iconBox, { borderColor:accent+'60', backgroundColor:accent+'14' }]}>
            <Icon name={tip.icon as any} size={11} color={accent} />
          </View>
          <Text style={[ib2.title, { color:accent }]}>{tip.title}</Text>
          <View style={{ flex:1 }} />
          <MaterialIcons name="close" size={10} color={accent+'60'} />
        </View>
        <Text style={[ib2.body, { color: accent + 'CC' }]}>{tip.body}</Text>
        {/* Progress dots */}
        <View style={{ flexDirection:'row', gap:3, marginTop:6 }}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <View key={i} style={{
              flex: i === pageIdx ? 2 : 1,
              height: 2.5, borderRadius: 2,
              backgroundColor: i === pageIdx ? accent : accent + '25',
            }} />
          ))}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const ib2 = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 58, left: 98, zIndex: 8888,
    maxWidth: SW - 118, backgroundColor: '#0B0F17',
    borderWidth: 1.5, borderRadius: 12, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowOffset:{width:0,height:6}, shadowOpacity:0.7, shadowRadius:20 },
      android: { elevation: 18 },
    }),
  },
  arrow: {
    position: 'absolute', top: 14, left: -9,
    width: 0, height: 0,
    borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 9,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
  },
  arrowInner: {
    position: 'absolute', top: 15.5, left: -6,
    width: 0, height: 0,
    borderTopWidth: 5.5, borderBottomWidth: 5.5, borderRightWidth: 7,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
  },
  topLine:  { height: 2.5 },
  content:  { paddingHorizontal: 12, paddingVertical: 10 },
  iconBox:  { width: 20, height: 20, borderRadius: 5, borderWidth: 1, alignItems:'center', justifyContent:'center' },
  title:    { fontFamily: MONO, fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  body:     { fontFamily: MONO, fontSize: 10, lineHeight: 15 },
});

// ─── AMBIENT PAGE GLOW ─────────────────────────────────────────────
function AmbientPageGlow({ accent }: { accent: string }) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: false }).start();
  }, [accent]);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fadeIn, zIndex: 0 }]}>
      <View style={{ position: 'absolute', top: -50, left: -40, width: 300, height: 300, borderRadius: 150, backgroundColor: accent, opacity: 0.052, transform: [{ scaleX: 1.7 }] }} />
      <View style={{ position: 'absolute', bottom: 50, right: -20, width: 240, height: 240, borderRadius: 120, backgroundColor: accent, opacity: 0.038, transform: [{ scaleY: 1.45 }] }} />
      <View style={{ position: 'absolute', top: '35%', left: '20%', width: 180, height: 180, borderRadius: 90, backgroundColor: accent, opacity: 0.022 }} />
      {([{ top: 5, right: 9 }, { bottom: 130, left: 11 }, { top: 195, right: 25 }] as any[]).map((pos: any, i: number) => (
        <View key={i} style={{ position: 'absolute', ...pos, width: 4, height: 4, borderRadius: 2, backgroundColor: accent, opacity: 0.6 }} />
      ))}
    </Animated.View>
  );
}

// ─── NEXUS BOOT CELEBRATION OVERLAY ──────────────────────────────
function NexusCelebrationOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const MONOC: any = Platform.OS === 'ios' ? 'Courier' : 'monospace';
  const fadeIn    = useRef(new Animated.Value(0)).current;
  const scaleIn   = useRef(new Animated.Value(0.3)).current;
  const ringAnim  = useRef(new Animated.Value(0)).current;
  const textIn    = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(60)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const particles = useRef(
    Array.from({ length: 22 }, (_, i) => ({
      angle: (i / 22) * Math.PI * 2 + Math.random() * 0.3,
      anim:  new Animated.Value(0),
      size:  4 + Math.random() * 12,
      dist:  120 + Math.random() * 60,
      color: ['#2FE38A','#38D9E8','#A468FF','#FFB43D','#FF4D5E','#2FE38A','#4A9EFF'][i % 7],
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    fadeIn.setValue(0); scaleIn.setValue(0.3); ringAnim.setValue(0);
    textIn.setValue(0); textSlide.setValue(60); glowPulse.setValue(0.3);
    particles.forEach(p => p.anim.setValue(0));

    Animated.sequence([
      Animated.timing(fadeIn, { toValue: 1, duration: 180, useNativeDriver: false }),
      Animated.parallel([
        Animated.spring(scaleIn, { toValue: 1, tension: 220, friction: 9, useNativeDriver: false }),
        Animated.timing(ringAnim, { toValue: 1, duration: 480, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(textIn, { toValue: 1, duration: 380, useNativeDriver: false }),
        Animated.spring(textSlide, { toValue: 0, tension: 220, friction: 14, useNativeDriver: false }),
        Animated.stagger(22, particles.map(p =>
          Animated.spring(p.anim, { toValue: 1, tension: 100, friction: 9, useNativeDriver: false })
        )),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1,   duration: 550, useNativeDriver: false }),
          Animated.timing(glowPulse, { toValue: 0.2, duration: 550, useNativeDriver: false }),
        ]),
        { iterations: 5 }
      ),
      Animated.timing(fadeIn, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start(() => onDone());
  }, [visible]);

  if (!visible) return null;

  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 2.2] });
  const ringOp    = ringAnim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.5, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { position: 'absolute', zIndex: 99999 }]}>
      <Animated.View style={[cel.overlay, { opacity: fadeIn }]}>
        {[240, 300, 360].map((sz, i) => (
          <Animated.View key={i} style={[cel.ring, { width: sz, height: sz, borderRadius: sz / 2, borderColor: ['#2FE38A','#38D9E8','#A468FF'][i], transform: [{ scale: ringScale }], opacity: ringOp }]} />
        ))}
        {particles.map((p, i) => {
          const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] });
          const ty = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist] });
          const op = p.anim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 0] });
          const sc = p.anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1.4, 0.6] });
          return (
            <Animated.View key={i} style={[cel.particle, { width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color, opacity: op, transform: [{ translateX: tx as any }, { translateY: ty as any }, { scale: sc as any }] }]} />
          );
        })}
        <Animated.View style={[cel.card, {
          transform: [{ scale: scaleIn }],
          borderColor: glowPulse.interpolate({ inputRange:[0.2,1], outputRange:['#00FF8870','#00FF88FF'] }) as any,
          ...Platform.select({ ios: { shadowColor: '#2FE38A', shadowOffset:{width:0,height:0}, shadowOpacity:0.9, shadowRadius:50 }, android:{ elevation:24 } }),
        }]}>
          <View style={{ flexDirection:'row', gap:12, marginBottom:18, alignItems:'center', justifyContent:'center' }}>
            {['#2FE38A','#38D9E8','#A468FF'].map((c,i)=>(
              <Animated.View key={i} style={{ width:12, height:12, borderRadius:6, backgroundColor:c, opacity:glowPulse }} />
            ))}
          </View>
          <Text style={[cel.titleNexus, Platform.OS==='ios'?{textShadowColor:'#2FE38A',textShadowOffset:{width:0,height:0},textShadowRadius:28}:{}]}>NEXUS</Text>
          <Animated.View style={[cel.accentLine, { opacity:textIn }]} />
          <Animated.Text style={[cel.titleOnline, { opacity:textIn, transform:[{translateY:textSlide as any}] }]}>ONLINE</Animated.Text>
          <Animated.Text style={[cel.subText, { opacity:textIn }]}>ALL SYSTEMS OPERATIONAL</Animated.Text>
          <Animated.View style={{ opacity:textIn, marginTop:18, alignSelf:'stretch', paddingHorizontal:6, gap:5 }}>
            {[
              { txt:'[BOOT] BUTLER OS v7.3 LOADED',    col:'#2FE38A' },
              { txt:'[SYS]  PYTHON ENGINE ARMED',       col:'#2FE38A' },
              { txt:'[NET]  ZERO CLOUD VERIFIED \u2713', col:'#38D9E8' },
              { txt:'[AI]   OLLAMA BRIDGE READY',       col:'#A468FF' },
              { txt:'[\u2713]   WELCOME TO NEXUS, SIR', col:'#FFB43D' },
            ].map((l,i)=>(
              <Text key={i} style={{ fontFamily:MONOC, fontSize:10, color:l.col, letterSpacing:0.4 }}>{l.txt}</Text>
            ))}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const cel = StyleSheet.create({
  overlay:    { flex:1, backgroundColor:'rgba(2,4,7,0.97)', alignItems:'center', justifyContent:'center' },
  ring:       { position:'absolute', borderWidth:2 },
  particle:   { position:'absolute' },
  card:       { alignItems:'center', padding:32, borderWidth:3, borderRadius:28, backgroundColor:'#070A10', minWidth:290 },
  accentLine: { height:3, width:210, borderRadius:2, backgroundColor:'#2FE38A', marginVertical:10 },
  titleNexus: { fontFamily:Platform.OS==='ios'?'Courier':'monospace', fontSize:46, fontWeight:'900', color:'#2FE38A', letterSpacing:12 },
  titleOnline:{ fontFamily:Platform.OS==='ios'?'Courier':'monospace', fontSize:30, fontWeight:'900', color:'#FFFFFF', letterSpacing:8 },
  subText:    { fontFamily:Platform.OS==='ios'?'Courier':'monospace', fontSize:9, color:'rgba(0,255,136,0.5)', letterSpacing:2.5, marginTop:4 },
});

// ─── SHARED ANIMATIONS ─────────────────────────────────────────────
function usePulse(duration = 900) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1,   duration, useNativeDriver: ND }),
      Animated.timing(anim, { toValue: 0.2, duration, useNativeDriver: ND }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return anim;
}

// ─── BUTLER ROBOT AVATAR ───────────────────────────────────────────
function ButlerAvatar({ size = 58, accentColor = T.cyan }: { size?: number; accentColor?: string }) {
  const pulseAnim = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1,    duration: 1600, useNativeDriver: ND }),
      Animated.timing(pulseAnim, { toValue: 0.35, duration: 1600, useNativeDriver: ND }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  let src: any = null;
  try { src = require('@/assets/images/butler-robot-face.jpg'); } catch {
    try { src = require('@/assets/images/nexus-robot-mascot.png'); } catch {
      try { src = require('@/assets/images/nexus-robot-v2.png'); } catch {}
    }
  }

  return (
    <Animated.View style={[
      { width: size, height: size, borderRadius: size * 0.22, borderWidth: 2.5, borderColor: accentColor, overflow: 'hidden', flexShrink: 0, backgroundColor: '#0B0F17' },
      ...Platform.select({ ios: [{ shadowColor: accentColor, shadowOffset:{width:0,height:0}, shadowOpacity: pulseAnim as any, shadowRadius: 14 }], android: [] }) as any,
    ]}>
      {src ? (
        <Image source={src} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <View style={{ width: size, height: size, backgroundColor: accentColor + '18', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="robot-happy" size={size * 0.55} color={accentColor} />
        </View>
      )}
    </Animated.View>
  );
}

// ─── HUD CORNERS ───────────────────────────────────────────────────
function HudCorners({ color, size = 14, t = 2 }: { color: string; size?: number; t?: number }) {
  return (
    <>
      <View style={{ position:'absolute', top:0, left:0, width:size, height:size, borderTopWidth:t, borderLeftWidth:t, borderColor:color }} />
      <View style={{ position:'absolute', top:0, right:0, width:size, height:size, borderTopWidth:t, borderRightWidth:t, borderColor:color }} />
      <View style={{ position:'absolute', bottom:0, left:0, width:size, height:size, borderBottomWidth:t, borderLeftWidth:t, borderColor:color }} />
      <View style={{ position:'absolute', bottom:0, right:0, width:size, height:size, borderBottomWidth:t, borderRightWidth:t, borderColor:color }} />
    </>
  );
}

// ─── PULSE DOT ─────────────────────────────────────────────────────
function PulseDot({ color, size = 7 }: { color: string; size?: number }) {
  const op = usePulse(700);
  return <Animated.View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:color, opacity:op }} />;
}

// ─── HOLOGRAPHIC HEADER ────────────────────────────────────────────
let _QA_BG: any = null;
try { _QA_BG = require('@/assets/images/qa-bg-metal.jpg'); } catch {}

function HoloHeader({ page, idx }: { page: typeof PAGES[0]; idx: number }) {
  const shimX  = useRef(new Animated.Value(-SW * 0.3)).current;
  const glowOp = useRef(new Animated.Value(0.4)).current;
  const scanY  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shim = Animated.loop(Animated.sequence([
      Animated.timing(shimX, { toValue: SW * 1.2, duration: 2400, useNativeDriver: ND }),
      Animated.timing(shimX, { toValue: -SW * 0.3, duration: 0, useNativeDriver: ND }),
      Animated.delay(3000),
    ]));
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowOp, { toValue: 1,   duration: 1200, useNativeDriver: ND }),
      Animated.timing(glowOp, { toValue: 0.2, duration: 1200, useNativeDriver: ND }),
    ]));
    const scan = Animated.loop(Animated.sequence([
      Animated.timing(scanY, { toValue: 1, duration: 3000, useNativeDriver: ND }),
      Animated.timing(scanY, { toValue: 0, duration: 0,    useNativeDriver: ND }),
      Animated.delay(800),
    ]));
    shim.start(); glow.start(); scan.start();
    return () => { shim.stop(); glow.stop(); scan.stop(); };
  }, []);

  const scanTop = scanY.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });

  return (
    <View style={[hh.wrap, { borderColor: page.accent + '40' }]}>
      <View style={[hh.topBar, { backgroundColor: page.accent }]} />
      {idx === 6 && _QA_BG ? (
        <Image source={_QA_BG} style={[StyleSheet.absoluteFill, { opacity: 0.22, borderRadius: 16 }]} contentFit="cover" />
      ) : null}
      <Animated.View pointerEvents="none" style={[hh.scanLine, { top: scanTop, backgroundColor: page.accent + '30' }]} />
      <Animated.View pointerEvents="none" style={[hh.shimmer, { transform: [{ translateX: shimX }] }]} />
      <HudCorners color={page.accent + '80'} size={12} t={1.5} />
      <View style={hh.content}>
        <ButlerAvatar size={62} accentColor={page.accent} />
        <View style={{ flex: 1, paddingLeft: 2 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:7, marginBottom:4 }}>
            <View style={[hh.labelChip, { borderColor: page.accent + '60', backgroundColor: page.accent + '12' }]}>
              <Text style={[hh.labelTxt, { color: page.accent }]}>{String(idx + 1).padStart(2,'0')}/{TOTAL} · {page.label}</Text>
            </View>
          </View>
          <Text style={[hh.title, { color: '#FFFFFF' }]}>{page.title}</Text>
          <Text style={[hh.sub, { color: page.accent + 'CC' }]}>{page.sub}</Text>
        </View>
      </View>
      <View style={[hh.bottomStrip, { backgroundColor: page.accent + '25' }]} />
    </View>
  );
}

const hh = StyleSheet.create({
  wrap:       { borderWidth: 1.5, borderRadius: 16, overflow: 'hidden', marginBottom: 14, position: 'relative', backgroundColor: '#0B0F17',
    ...Platform.select({ ios:{ shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:14 }, android:{elevation:8} }) },
  topBar:     { height: 3 },
  scanLine:   { position:'absolute', left:0, right:0, height:1.5, opacity:0.6, zIndex:0 },
  shimmer:    { position:'absolute', top:0, bottom:0, width:SW*0.25, backgroundColor:'rgba(255,255,255,0.035)', transform:[{skewX:'-16deg'}], zIndex:0 },
  content:    { flexDirection:'row', alignItems:'center', gap:14, padding:16, paddingBottom:12, zIndex:1 },
  iconOrb:    { width:62, height:62, borderRadius:18, borderWidth:2, alignItems:'center', justifyContent:'center', flexShrink:0, position:'relative', overflow:'hidden' },
  iconInnerRing:{ position:'absolute', width:52, height:52, borderRadius:14, borderWidth:1.5, backgroundColor:'transparent' },
  labelChip:  { borderWidth:1, borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  labelTxt:   { fontSize:9, fontWeight:'900', fontFamily:MONO, letterSpacing:1 },
  title:      { fontSize:22, fontWeight:'900', fontFamily:MONO, letterSpacing:0.5, lineHeight:26 },
  sub:        { fontSize:10, fontFamily:MONO, marginTop:4, lineHeight:14 },
  bottomStrip:{ height:3 },
});

// ─── NEON CARD ─────────────────────────────────────────────────────
function NeonCard({ color, children, style }: { color: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[nc.card, { borderColor: color + '50', borderLeftColor: color }, style]}>
      <View style={[nc.leftBar, { backgroundColor: color }]} />
      <View style={{ flex: 1, paddingLeft: 12, paddingVertical: 10, paddingRight: 12 }}>{children}</View>
    </View>
  );
}
const nc = StyleSheet.create({
  card:    { flexDirection:'row', alignItems:'stretch', borderWidth:1.5, borderRadius:12, borderLeftWidth:4, backgroundColor:T.surface, marginBottom:8, overflow:'hidden' },
  leftBar: { width:4, alignSelf:'stretch' },
});

// ─── SECTION HEADER ────────────────────────────────────────────────
function SectionHdr({ label, color, icon }: { label: string; color: string; icon?: string }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:7, marginBottom:10, marginTop:6 }}>
      <View style={{ width:3, height:14, borderRadius:2, backgroundColor:color }} />
      {icon && <MaterialCommunityIcons name={icon as any} size={10} color={color} />}
      <Text style={{ fontSize:9, fontWeight:'900', fontFamily:MONO, color, letterSpacing:1.6 }}>{label}</Text>
      <View style={{ flex:1, height:1, backgroundColor:color+'25' }} />
    </View>
  );
}

// ─── CHECKBOX ITEM ─────────────────────────────────────────────────
function CheckItem({ label, sub, checked, color, onToggle }: {
  label: string; sub: string; checked: boolean; color: string; onToggle: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, tension: 280, friction: 8, useNativeDriver: false }),
    ]).start();
    try { haptics.medium(); } catch {}
    onToggle();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85}
        style={[ci.row, { borderColor: checked ? color + '70' : 'rgba(100,140,160,0.2)', backgroundColor: checked ? color + '0D' : 'rgba(10,18,32,0.5)' }]}>
        <View style={[ci.box, { borderColor: checked ? color : T.textMid + '60', backgroundColor: checked ? color : 'transparent' }]}>
          {checked && <MaterialIcons name="check" size={16} color="#000" />}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[ci.label, { color: checked ? color : T.text }]} numberOfLines={3}>
            <Text style={{ color: T.danger }}>* </Text>{label}
          </Text>
          <Text style={ci.sub} numberOfLines={2}>{sub}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const ci = StyleSheet.create({
  row:   { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:14, paddingHorizontal:16, borderRadius:14, borderWidth:2, minHeight:80, marginBottom:9 },
  box:   { width:30, height:30, borderRadius:8, borderWidth:2.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  label: { fontSize:13, fontWeight:'700', fontFamily:MONO, lineHeight:18 },
  sub:   { fontSize:10, fontFamily:MONO, color:'rgba(100,140,160,0.8)', lineHeight:14 },
});

// ══════════════════════════════════════════════════════════════
// PAGE CONTENT COMPONENTS
// ══════════════════════════════════════════════════════════════

// ─── WELCOME CIRCUIT ACCENT ──────────────────────────────────────
// Reuses AnimatedWire (flowing dot traces) + TechGrid (HUD background grid)
// Shown only on the WELCOME step (idx === 0). No new dependencies.
function WelcomeCircuitAccent({ accent }: { accent: string }) {
  const mountAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(mountAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: mountAnim, marginBottom: 10 }}>
      <View style={[
        wca.panel,
        { borderColor: accent + '35', backgroundColor: accent + '06' },
      ]}>
        {/* Subtle HUD grid background */}
        <TechGrid rows={6} cols={10} color={accent + '18'} animated />
        {/* Corner brackets (HUD aesthetic) */}
        <WireCorner size={22} color={accent + 'AA'} corner="tl" />
        <WireCorner size={22} color={accent + 'AA'} corner="tr" />
        <WireCorner size={22} color={accent + '60'} corner="bl" />
        <WireCorner size={22} color={accent + '60'} corner="br" />
        {/* Horizontal wire trace — top of panel */}
        <View style={{ alignItems: 'center', paddingTop: 14 }}>
          <HorizontalWire width={SW * 0.55} color={accent} speed={2200} dotCount={3} />
        </View>
        {/* Central icon + label */}
        <View style={wca.center}>
          <View style={[
            wca.iconRing,
            { borderColor: accent + '70', backgroundColor: accent + '10' },
          ]}>
            {/* Left vertical wire */}
            <AnimatedWireDefault
              direction="vertical"
              length={38}
              color={accent}
              thickness={1.5}
              dotCount={2}
              speed={1800}
              caps={false}
              opacity={0.8}
              absolute
              style={{ left: -24, top: 4 }}
            />
            {/* Right vertical wire */}
            <AnimatedWireDefault
              direction="vertical"
              length={38}
              color={accent}
              thickness={1.5}
              dotCount={2}
              speed={2400}
              caps={false}
              opacity={0.8}
              absolute
              delay={600}
              style={{ right: -24, top: 4 }}
            />
            <MaterialCommunityIcons name="cpu-64-bit" size={32} color={accent} />
          </View>
          <TypewriterLine
            text="BUTLER_OS v7.3 :: CIRCUIT INIT"
            color={accent + 'CC'}
            speed={28}
            style={{ fontSize: 10, letterSpacing: 1.2, marginTop: 10, fontFamily: MONO }}
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' }}>
            {[T.cyan, T.green, T.purple, T.amber].map((col, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col, opacity: 0.7 }} />
            ))}
          </View>
        </View>
        {/* Bottom horizontal wire */}
        <View style={{ alignItems: 'center', paddingBottom: 14 }}>
          <HorizontalWire width={SW * 0.4} color={accent} speed={2800} dotCount={2} />
        </View>
      </View>
    </Animated.View>
  );
}

const wca = StyleSheet.create({
  panel: {
    borderWidth: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 140,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});

function WelcomePage({ accent }: { accent: string }) {
  const CAPS = [
    { icon:'code-braces-box', color:T.cyan,   label:'SCRIPTS',    desc:'250+ Python automations, one tap to run' },
    { icon:'robot-happy',     color:T.purple, label:'LOCAL AI',   desc:'Ollama LLM — 100% offline, no API key' },
    { icon:'brain',           color:T.amber,  label:'SIGMA-NET',  desc:'Auto-crawls Python docs and builds your KB' },
    { icon:'shield-lock',     color:T.green,  label:'ZERO CLOUD', desc:'HMAC-SHA256 · LAN only · no accounts' },
    { icon:'hammer-screwdriver',color:T.purple,label:'BUILDER',   desc:'Visual pipeline drag-and-drop editor' },
    { icon:'desktop-tower-monitor',color:T.cyan,label:'PC HEALTH',desc:'Live CPU / RAM / Disk gauges & process list' },
  ];
  const TERMINAL = [
    { text:'BUTLER_OS v7.3 INITIALIZING...', color:accent },
    { text:'PYTHON ENGINE .............. OK',  color:T.green },
    { text:'HMAC-SHA256 AUTH ........... OK',  color:T.green },
    { text:'OLLAMA BRIDGE .............. READY',color:T.green },
    { text:'ZERO CLOUD VERIFIED ......... \u2713', color:T.green },
  ];
  const cursorBlink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(cursorBlink, { toValue:0, duration:500, useNativeDriver:ND }),
      Animated.timing(cursorBlink, { toValue:1, duration:500, useNativeDriver:ND }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const cpuPts = [20,25,18,30,22,35,28,26,30,24,32,36,40,34,38,35,42,38,36,40];
  const ramPts = [45,48,50,47,52,55,50,58,62,57,60,55,58,62,65,60,62,67,63,62];
  const netPts = [8,12,9,15,11,18,14,20,17,22,19,25,21,18,23,20,24,22,26,20];
  return (
    <View style={{ gap: 10 }}>
      {/* Circuit accent — WELCOME step only */}
      <WelcomeCircuitAccent accent={accent} />
      <Suspense fallback={null}><OnboardingHeroStep onBegin={() => {}} /></Suspense>
      {/* Security showcase — HUD tiles matching image 1 */}
      <View style={{ marginBottom: 6 }}>
        <SecurityShowcase mode="full" />
      </View>
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
        {[
          { icon:'wifi-off', color:T.green, label:'LAN ONLY', sub:'ZERO CLOUD' },
          { icon:'lock', color:T.cyan, label:'HMAC-256', sub:'SIGNED' },
          { icon:'block', color:T.amber, label:'DISABLED', sub:'AUTO-RUN' },
          { icon:'visibility-off', color:T.purple, label:'NONE', sub:'TELEMETRY' },
        ].map(tile => (
          <View key={tile.label} style={[wp.featureTile, { borderColor: tile.color + '60', backgroundColor: tile.color + '08' }]}>
            <HudCorners color={tile.color + '30'} size={6} t={1} />
            <View style={[wp.tileIcon, { borderColor: tile.color + '50', backgroundColor: tile.color + '14' }]}>
              <MaterialIcons name={tile.icon as any} size={22} color={tile.color} />
            </View>
            <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:tile.color, letterSpacing:0.5 }}>{tile.label}</Text>
            <Text style={{ fontSize:9, fontFamily:MONO, color:tile.color + '70' }}>{tile.sub}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection:'row', gap:7 }}>
        {[
          { label:'CPU', icon:'cpu-64-bit', pts:cpuPts, color:T.cyan, val:'-- --' },
          { label:'RAM', icon:'memory', pts:ramPts, color:T.purple, val:'-- --' },
          { label:'NET', icon:'lan', pts:netPts, color:T.green, val:'-- --' },
        ].map(m => {
          const maxV = Math.max(...m.pts, 1);
          const BAR_COUNT = 28;
          const bars = Array.from({ length: BAR_COUNT }, (_, ii) => {
            const srcIdx = Math.floor((ii / (BAR_COUNT - 1)) * (m.pts.length - 1));
            return Math.max(3, (m.pts[Math.min(srcIdx, m.pts.length - 1)] / maxV) * 52);
          });
          return (
            <View key={m.label} style={[wp.metricCard, { borderColor: m.color + '80', backgroundColor: '#070A10', borderWidth: 1.5 }]}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:5, marginBottom:10 }}>
                <MaterialCommunityIcons name={m.icon as any} size={16} color={m.color} />
                <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:m.color, flex:1 }}>{m.label}</Text>
                <Text style={{ fontSize:10, fontWeight:'900', fontFamily:MONO, color:m.color + 'CC' }}>{m.val}</Text>
              </View>
              <View style={{ flexDirection:'row', alignItems:'flex-end', gap:1.5, height:54, overflow:'hidden' }}>
                {bars.map((barH, ii) => (
                  <View key={ii} style={{ flex:1, height: barH, borderTopLeftRadius:2, borderTopRightRadius:2, backgroundColor: m.color, opacity: 0.15 + (ii / (BAR_COUNT - 1)) * 0.85 }} />
                ))}
              </View>
              <View style={{ height:1.5, backgroundColor:m.color, marginTop:3, borderRadius:1 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection:'row', gap:8 }}>
        {[
          { val:'250+', label:'SCRIPTS', color:accent },
          { val:'100%', label:'LOCAL', color:T.green },
          { val:'0', label:'CLOUD', color:T.amber },
          { val:'\u221e', label:'UPTIME', color:T.purple },
        ].map(s => (
          <View key={s.label} style={[wp.statCell, { borderColor: s.color + '35', backgroundColor: s.color + '09' }]}>
            <Text style={{ fontSize:20, fontWeight:'900', fontFamily:MONO, color:s.color }}>{s.val}</Text>
            <Text style={{ fontSize:7.5, fontFamily:MONO, color:s.color + '80', letterSpacing:0.8 }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={[wp.terminal]}>
        <View style={wp.termHeader}>
          {['#FF4D5E','#FFC94A','#2FE38A'].map((c,i) => <View key={i} style={{ width:9, height:9, borderRadius:5, backgroundColor:c }} />)}
          <Text style={{ flex:1, fontSize:8.5, fontFamily:MONO, color:T.textMid, textAlign:'center' }}>BUTLER_OS TERMINAL</Text>
        </View>
        <View style={{ padding:12, gap:5 }}>
          {TERMINAL.map((l,i) => (<Text key={i} style={{ fontSize:11, fontFamily:MONO, color:l.color }}>{l.text}</Text>))}
          <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
            <Text style={{ fontSize:11, fontFamily:MONO, color:accent + '70' }}>{'>'}</Text>
            <Animated.View style={{ width:7, height:13, backgroundColor:accent, opacity:cursorBlink }} />
          </View>
        </View>
      </View>
      <SectionHdr label="CORE CAPABILITIES" color={accent} icon="star-four-points" />
      {[0,1,2].map(row => (
        <View key={row} style={{ flexDirection:'row', gap:8 }}>
          {CAPS.slice(row*2, row*2+2).map(cap => (
            <View key={cap.label} style={[wp.capCard, { borderColor: cap.color + '35', borderLeftColor: cap.color, backgroundColor: cap.color + '06' }]}>
              <MaterialCommunityIcons name={cap.icon as any} size={18} color={cap.color} style={{ marginBottom:6 }} />
              <Text style={{ fontSize:9.5, fontWeight:'900', fontFamily:MONO, color:cap.color, marginBottom:3 }}>{cap.label}</Text>
              <Text style={{ fontSize:9, fontFamily:MONO, color:T.textMid, lineHeight:13 }}>{cap.desc}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={[wp.privacyBanner, { borderColor: T.green + '45' }]}>
        <HudCorners color={T.green + '55'} size={10} t={1.5} />
        <View style={{ flexDirection:'row', alignItems:'center', gap:12, padding:14 }}>
          <View style={{ width:42, height:42, borderRadius:12, borderWidth:1.5, borderColor:T.green+'55', backgroundColor:T.green+'12', alignItems:'center', justifyContent:'center' }}>
            <MaterialIcons name="shield" size={22} color={T.green} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:T.green }}>ZERO CLOUD GUARANTEE</Text>
            <Text style={{ fontSize:9, fontFamily:MONO, color:T.textMid, lineHeight:13, marginTop:3 }}>Your data NEVER leaves your home network. Local SQLite · HMAC-SHA256 · No accounts.</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
const wp = StyleSheet.create({
  featureTile:  { flex:1, minWidth:'45%', borderWidth:1.5, borderRadius:12, padding:12, alignItems:'center', gap:5, position:'relative', overflow:'hidden' },
  tileIcon:     { width:46, height:46, borderRadius:12, borderWidth:1.5, alignItems:'center', justifyContent:'center', marginBottom:2 },
  metricCard:   { flex:1, borderWidth:1.5, borderRadius:14, backgroundColor:'#070A10', padding:10, overflow:'hidden', position:'relative' },
  statCell:     { flex:1, alignItems:'center', borderWidth:1.5, borderRadius:12, paddingVertical:12, gap:4 },
  terminal:     { backgroundColor:'#050810', borderRadius:12, borderWidth:1, borderColor:T.green+'25', overflow:'hidden' },
  termHeader:   { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:9, backgroundColor:T.green+'10', borderBottomWidth:1, borderBottomColor:T.green+'18' },
  capCard:      { flex:1, borderWidth:1.5, borderLeftWidth:4, borderRadius:12, padding:12 },
  privacyBanner:{ borderWidth:1.5, borderRadius:16, backgroundColor:'#050810', overflow:'hidden', position:'relative' },
  identCard:    { borderWidth:2, borderRadius:16, backgroundColor:'#0B0F17', overflow:'hidden', position:'relative' },
  bigAvatarWrap:{ borderRadius:14, borderWidth:2, overflow:'hidden', flexShrink:0 },
  cyanSquare:   { width:80, height:80, borderRadius:16, borderWidth:3, overflow:'hidden', backgroundColor:'#0B0F17' },
  purpleBadge:  { position:'absolute', top:-10, left:-10, width:30, height:30, borderRadius:15, backgroundColor:'#A468FF', borderWidth:2, borderColor:'#A468FF', alignItems:'center', justifyContent:'center', zIndex:10 },
  speechCard:   { borderWidth:1.5, borderRadius:16, backgroundColor:'#0B0F17', overflow:'hidden' },
  avatarWrap:   { width:62, height:62, borderRadius:14, borderWidth:2, overflow:'hidden', flexShrink:0 },
  statsRow:     { flexDirection:'row', gap:8 },
});

function AppTourPage({ accent }: { accent: string }) {
  const TABS = [
    { icon:'home-variant', color:T.cyan, label:'HOME', desc:'Dashboard · QR pairing · PC health · smart alerts' },
    { icon:'code-braces-box', color:T.green, label:'SCRIPTS', desc:'250+ Python scripts · one-tap execution · AI writer' },
    { icon:'robot-happy', color:T.purple, label:'AI CHAT', desc:'Ollama LLM · 100% offline · remembers context' },
    { icon:'brain', color:T.amber, label:'KNOWLEDGE', desc:'SIGMA-NET auto-crawler · vector KB · gap analysis' },
    { icon:'desktop-tower-monitor', color:T.cyan, label:'PC HEALTH', desc:'Live CPU / RAM / Disk · process list · uptime' },
    { icon:'hammer-screwdriver', color:T.purple, label:'BUILDER', desc:'Visual drag-drop pipeline · 40+ node types' },
    { icon:'folder-multiple', color:T.amber, label:'VAULT', desc:'Themes · custom skins · cosmetic settings' },
    { icon:'lan-connect', color:T.cyan, label:'LINK', desc:'Full log viewer · connection diagnostics · crash logs' },
    { icon:'cog-box', color:T.green, label:'CONFIG', desc:'Connection setup · data deletion · permissions' },
  ];
  return (
    <View style={{ gap: 8 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>NINE TABS · ONE COMMAND CENTER</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>Every tab is a specialized tool. Together they make your PC an automated powerhouse.</Text>
      </NeonCard>
      <SectionHdr label="TAB OVERVIEW" color={accent} icon="apps" />
      {TABS.map((tab, i) => (
        <View key={tab.label} style={[at.tabRow, { borderColor: tab.color + '30', borderLeftColor: tab.color }]}>
          <View style={[at.tabNum, { borderColor: tab.color + '50', backgroundColor: tab.color + '12' }]}>
            <MaterialCommunityIcons name={tab.icon as any} size={16} color={tab.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:tab.color }}>{tab.label}</Text>
            <Text style={{ fontSize:10, fontFamily:MONO, color:T.textMid, lineHeight:14, marginTop:2 }}>{tab.desc}</Text>
          </View>
          <View style={[at.tabIndex, { borderColor: tab.color + '35' }]}>
            <Text style={{ fontSize:9, fontWeight:'900', fontFamily:MONO, color:tab.color }}>{i+1}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
const at = StyleSheet.create({
  tabRow:   { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:9, paddingHorizontal:12, borderWidth:1.5, borderLeftWidth:4, borderRadius:12, backgroundColor:T.surface, marginBottom:6 },
  tabNum:   { width:40, height:40, borderRadius:10, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  tabIndex: { width:26, height:26, borderRadius:6, borderWidth:1, alignItems:'center', justifyContent:'center' },
});

const CONSENT_ITEMS = [
  { key:'age',    color:T.cyan,   label:'I am 18 years of age or older',                    sub:'Butler AI is a developer tool for adults only' },
  { key:'terms',  color:T.amber,  label:'I accept the Terms of Service',                    sub:'I will only use Butler AI on PCs I own or am authorised to access' },
  { key:'pp',     color:T.green,  label:'I accept the Privacy Policy',                      sub:'Device UUID stored locally only. No personal data collected.' },
  { key:'lan',    color:T.cyan,   label:'I understand this app operates over my local LAN', sub:'No cloud relay. Direct Wi-Fi only.' },
  { key:'camera', color:T.purple, label:'Camera is for QR pairing only',                   sub:'Camera never records, stores, or transmits any images.' },
  { key:'exec',   color:T.amber,  label:'I understand scripts run with my PC permissions',  sub:'I am responsible for reviewing scripts before execution.' },
];

function SafetyConsentPage({ accent, checkedState, onToggle, allChecked }: {
  accent: string; checkedState: Record<string,boolean>; onToggle: (k:string)=>void; allChecked: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>REQUIRED AGREEMENTS</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>These checkboxes are genuine legal agreements. Read each one carefully before ticking.</Text>
      </NeonCard>
      {CONSENT_ITEMS.map((item) => (
        <CheckItem key={item.key} label={item.label} sub={item.sub} checked={!!checkedState[item.key]} color={item.color} onToggle={() => onToggle(item.key)} />
      ))}
      <View style={[csp.statusBar, { borderColor: allChecked ? T.green + '45' : T.danger + '35', backgroundColor: allChecked ? T.green + '08' : T.danger + '08' }]}>
        <MaterialIcons name={allChecked ? 'check-circle' : 'lock'} size={14} color={allChecked ? T.green : T.danger} />
        <Text style={{ fontSize:11, fontFamily:MONO, color: allChecked ? T.green : T.danger, flex:1 }}>
          {allChecked ? 'All consents accepted — tap NEXT to continue' : 'Please tick all checkboxes to proceed'}
        </Text>
      </View>
    </View>
  );
}
const csp = StyleSheet.create({
  statusBar: { flexDirection:'row', alignItems:'center', gap:8, padding:12, borderRadius:10, borderWidth:1, marginTop:4 },
});

const PLEDGE_ITEMS = [
  { color:T.danger, label:'NO UNAUTHORISED ACCESS',  desc:'I will NOT access computers without authorisation.' },
  { color:T.danger, label:'NO MALWARE',              desc:'I will NOT deploy malware, ransomware, or destructive scripts.' },
  { color:T.danger, label:'NO PRIVACY VIOLATIONS',   desc:'I will NOT use Butler AI to violate others\' privacy.' },
  { color:T.amber,  label:'LAWFUL USE ONLY',         desc:'I will use Butler AI only for lawful personal automation.' },
  { color:T.green,  label:'PERSONAL RESPONSIBILITY', desc:'I understand I remain personally responsible for all scripts I run.' },
  { color:T.cyan,   label:'NO AUTO-EXECUTION',       desc:'Every command requires my active tap — no background execution.' },
];

function SafetyPledgePage({ accent, checkedState, onToggle, allChecked }: {
  accent: string; checkedState: Record<string,boolean>; onToggle: (k:string)=>void; allChecked: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>SIX BINDING RULES</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>Butler AI is a powerful tool. These rules protect you, others, and the product's integrity.</Text>
      </NeonCard>
      {PLEDGE_ITEMS.map((item) => (
        <CheckItem key={item.label} label={item.label} sub={item.desc} checked={!!checkedState[item.label]} color={item.color} onToggle={() => onToggle(item.label)} />
      ))}
      <View style={[csp.statusBar, { borderColor: allChecked ? T.green + '45' : T.danger + '35', backgroundColor: allChecked ? T.green + '08' : T.danger + '08' }]}>
        <MaterialIcons name={allChecked ? 'check-circle' : 'lock'} size={14} color={allChecked ? T.green : T.danger} />
        <Text style={{ fontSize:11, fontFamily:MONO, color: allChecked ? T.green : T.danger, flex:1 }}>
          {allChecked ? 'All pledges acknowledged — tap NEXT to continue' : 'All items required to proceed'}
        </Text>
      </View>
    </View>
  );
}

const URLS = {
  privacy:    'https://shawnjan-cmd.github.io/privacy-policy-/',
  terms:      'https://shawnjan-cmd.github.io/privacy-policy-/#terms-of-service',
  dataSafety: 'https://shawnjan-cmd.github.io/privacy-policy-/#data-safety',
  deletion:   'https://shawnjan-cmd.github.io/privacy-policy-/#data-deletion',
};
const LEGAL_DOCS = [
  { icon:'visibility',    color:T.cyan,   title:'Privacy Policy',  sub:'GDPR COMPLIANT', fact:'Device UUID only — zero personal data', url:URLS.privacy },
  { icon:'gavel',         color:T.amber,  title:'Terms of Service',sub:'18+ REQUIRED',   fact:'Personal PCs only · Lawful use only',  url:URLS.terms },
  { icon:'shield',        color:T.green,  title:'Data Safety',     sub:'PLAY STORE FORM',fact:'Camera = QR scan only · No analytics', url:URLS.dataSafety },
  { icon:'delete-forever',color:T.danger, title:'Delete My Data',  sub:'GDPR RIGHT',     fact:'Settings → 3 taps → immediate & permanent', url:URLS.deletion },
];

function LegalPage({ accent, onOpen }: { accent: string; onOpen: (url:string,title:string)=>void }) {
  return (
    <View style={{ gap: 10 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>4 DOCS · ALL PUBLICLY HOSTED</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>Required by Google Play. Tap any card to read the full document in-app.</Text>
      </NeonCard>
      {LEGAL_DOCS.map((doc) => (
        <TouchableOpacity key={doc.title} onPress={() => { try { haptics.medium(); } catch {}; onOpen(doc.url, doc.title); }} activeOpacity={0.85}
          style={[ld.card, { borderColor: doc.color + '50', borderLeftColor: doc.color }]}>
          <View style={[ld.topBar, { backgroundColor: doc.color }]} />
          <View style={{ flexDirection:'row', alignItems:'center', gap:12, padding:14, paddingBottom:10 }}>
            <View style={[ld.iconBox, { borderColor:doc.color+'55', backgroundColor:doc.color+'12' }]}>
              <MaterialIcons name={doc.icon as any} size={22} color={doc.color} />
            </View>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:15, fontWeight:'900', fontFamily:MONO, color:'#FFF', marginBottom:3 }}>{doc.title}</Text>
              <Text style={{ fontSize:9, fontFamily:MONO, color:doc.color+'AA' }}>{doc.fact}</Text>
            </View>
          </View>
          <View style={[ld.viewRow, { borderTopColor: doc.color + '20' }]}>
            <MaterialIcons name="open-in-new" size={12} color={doc.color} />
            <Text style={{ fontSize:10, fontWeight:'900', fontFamily:MONO, color:doc.color }}>VIEW FULL DOCUMENT</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ld = StyleSheet.create({
  card:    { borderWidth:2, borderLeftWidth:5, borderRadius:14, backgroundColor:'#0B0F17', overflow:'hidden', position:'relative', marginBottom:8 },
  topBar:  { height:3 },
  iconBox: { width:48, height:48, borderRadius:12, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  badge:   { borderWidth:1, borderRadius:6, paddingHorizontal:7, paddingVertical:4 },
  viewRow: { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:10, borderTopWidth:1 },
});

const PERMS = [
  { icon:'wifi', color:T.cyan, label:'LOCAL NETWORK', badge:'REQUIRED', desc:'Connect to your PC server over home Wi-Fi. Never touches the public internet.' },
  { icon:'camera-alt', color:T.purple, label:'CAMERA', badge:'OPTIONAL', desc:'One-shot QR scanning to pair with your PC. Images processed in memory — never stored.' },
  { icon:'folder', color:T.amber, label:'STORAGE', badge:'OPTIONAL', desc:'Phone-to-PC file transfer only. Never reads files you haven\'t explicitly selected.' },
];
const NO_PERMS = ['CONTACTS','LOCATION','MICROPHONE','CALL LOG','SMS / MMS','BACKGROUND LOCATION'];

function PermissionsPage({ accent }: { accent: string }) {
  return (
    <View style={{ gap: 10 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>ONLY 3 PERMISSIONS</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>Butler AI requests no sensitive permissions. We explain every single one.</Text>
      </NeonCard>
      {PERMS.map(p => (
        <View key={p.label} style={[pp.permCard, { borderColor:p.color+'35', backgroundColor:p.color+'06' }]}>
          <View style={[pp.permIcon, { backgroundColor:p.color+'18', borderColor:p.color+'35' }]}>
            <MaterialIcons name={p.icon as any} size={22} color={p.color} />
          </View>
          <View style={{ flex:1, gap:4 }}>
            <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:p.color }}>{p.label}</Text>
            <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:16 }}>{p.desc}</Text>
          </View>
        </View>
      ))}
      <View style={{ backgroundColor:T.dangerDim, borderRadius:12, borderWidth:1, borderColor:T.danger+'25', padding:14 }}>
        <Text style={{ fontSize:11, fontWeight:'900', fontFamily:MONO, color:T.danger, marginBottom:8 }}>NEVER REQUESTED</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6 }}>
          {NO_PERMS.map(l => (
            <View key={l} style={{ borderWidth:1, borderRadius:8, paddingHorizontal:8, paddingVertical:4, borderColor:T.danger+'30', backgroundColor:T.danger+'06' }}>
              <Text style={{ fontSize:9.5, fontFamily:MONO, color:T.danger+'90' }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
const pp = StyleSheet.create({
  permCard: { flexDirection:'row', alignItems:'flex-start', gap:12, padding:14, borderRadius:14, borderWidth:1.5, marginBottom:4 },
  permIcon: { width:44, height:44, borderRadius:12, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
});

const QA_ITEMS = [
  { q:'Does it run automatically?',       a:'NO — every script requires your active tap. No background execution, no scheduler.' },
  { q:'Does it upload my data?',          a:'NEVER — 100% local SQLite database on your PC. No data leaves your local network.' },
  { q:'How is it secured?',               a:'HMAC-SHA256 signed requests · AES-256 encrypted · Single-device pairing · 64-char tokens.' },
  { q:'How do I pair my PC?',             a:'Run butler_server.py on your PC \u2192 it shows a QR code \u2192 tap QR scan on HOME tab.' },
  { q:'Can I undo a script?',             a:'YES — every execution is logged and reversible for 15 minutes after running.' },
  { q:'How do I delete all my data?',     a:'Settings \u2192 DELETE ALL MY DATA — immediate, permanent, irreversible in 3 taps.' },
  { q:'Does the AI model call the cloud?',a:'NO — Ollama runs entirely on your PC. Prompts never leave your LAN.' },
  { q:'What about dangerous scripts?',    a:'Built-in Malicious Script Blocker scans for 15 threat patterns before execution.' },
];

function QAPage({ accent }: { accent: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>STRAIGHT ANSWERS</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>Tap any question to expand. No fluff — just facts.</Text>
      </NeonCard>
      {QA_ITEMS.map((item, i) => (
        <TouchableOpacity key={i} onPress={() => { try { haptics.selection(); } catch {}; setOpenIdx(openIdx === i ? null : i); }} activeOpacity={0.85}
          style={[qa.card, { borderColor: openIdx===i ? accent+'60' : T.border, backgroundColor: openIdx===i ? accent+'08' : T.surface }]}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
            <View style={[qa.qIcon, { borderColor:accent+'55', backgroundColor:accent+'12' }]}>
              <MaterialIcons name="help-outline" size={14} color={accent} />
            </View>
            <Text style={{ flex:1, fontSize:12, fontWeight:'900', fontFamily:MONO, color:openIdx===i ? accent : T.text, lineHeight:17 }}>{item.q}</Text>
            <MaterialIcons name={openIdx===i ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color={openIdx===i ? accent : T.textMid} />
          </View>
          {openIdx === i && <Text style={{ fontSize:12, fontFamily:MONO, color:T.text, lineHeight:19, paddingLeft:42, paddingTop:8 }}>{item.a}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}
const qa = StyleSheet.create({
  card:  { borderWidth:1.5, borderRadius:12, padding:12 },
  qIcon: { width:30, height:30, borderRadius:8, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
});

const SERVER_ITEMS = [
  { icon:'home',       color:T.green,  title:'100% LOCAL HOSTING',   desc:'butler_server.py runs entirely on YOUR PC. We operate zero cloud servers.' },
  { icon:'storage',    color:T.cyan,   title:'LOCAL SQLite DATABASE', desc:'All data stored in a single SQLite file on your PC. Inspect, backup, or delete anytime.' },
  { icon:'lan',        color:T.green,  title:'LAN-ONLY BINDING',      desc:'Server binds to your local network only — never exposed to the internet.' },
  { icon:'vpn-key',    color:T.amber,  title:'HMAC-SHA256 AUTH',      desc:'Every single request signed with a 64-character cryptographic bearer token.' },
  { icon:'smart-toy',  color:T.purple, title:'OLLAMA AI STAYS LOCAL', desc:'AI inference runs on your PC via Ollama. Prompts never leave your LAN.' },
  { icon:'no-accounts',color:T.green,  title:'ZERO ACCOUNTS',         desc:'No registration. No login. No email. Device UUID is the only identifier — stored locally.' },
];

function ServerPrivacyPage({ accent }: { accent: string }) {
  return (
    <View style={{ gap: 8 }}>
      <NeonCard color={accent}>
        <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, marginBottom:4 }}>TRANSPARENT ARCHITECTURE</Text>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>We document exactly what the server does. No surprises. Fully open source.</Text>
      </NeonCard>
      {SERVER_ITEMS.map((item, i) => (
        <View key={i} style={[srv.card, { borderColor:item.color+'25', backgroundColor:item.color+'06' }]}>
          <View style={[srv.icon, { backgroundColor:item.color+'18', borderColor:item.color+'35' }]}>
            <MaterialIcons name={item.icon as any} size={18} color={item.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:10.5, fontWeight:'900', fontFamily:MONO, color:item.color, letterSpacing:0.4 }}>{item.title}</Text>
            <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:16, marginTop:3 }}>{item.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
const srv = StyleSheet.create({
  card: { flexDirection:'row', alignItems:'flex-start', gap:12, padding:12, borderRadius:12, borderWidth:1, marginBottom:4 },
  icon: { width:38, height:38, borderRadius:10, borderWidth:1, alignItems:'center', justifyContent:'center', flexShrink:0 },
});

function PCSetupPage({ accent, onScanQR }: { accent: string; onScanQR: () => void }) {
  const STEPS = [
    {
      num:'01', color:T.cyan, icon:'download-circle',
      title:'DOWNLOAD BUTLER SERVER',
      desc:'butler_server.py runs on your PC, displays a QR code, and creates a secure LAN bridge to your phone. It self-checks all dependencies and auto-installs missing packages on first run.',
      bullets: [
        'Run: python butler_server.py',
        'A QR code + IP address + port number will appear on screen',
        'No cloud · No accounts · No installation wizard',
      ],
    },
    {
      num:'02', color:T.amber, icon:'cog-play',
      title:'RUN THE INSTALLER',
      desc:'One script installs everything automatically: Python 3.12+, all pip packages, Ollama AI, and the qwen2.5-coder:7b model on your PC.',
      bullets: [
        'Windows: Right-click butler_setup.ps1 → Run with PowerShell',
        'Mac/Linux: chmod +x setup.sh && ./setup.sh',
        'Sets up desktop shortcut for one-click server launch',
      ],
    },
    {
      num:'03', color:T.green, icon:'qr-code-scanner',
      title:'CONNECT & CONTROL',
      desc:'Scan the QR code shown by the server, or type the 6-digit PIN shown on screen. Or enter the IP address + port directly in the manual entry field. You are now paired.',
      bullets: [
        'Scan QR or enter IP manually',
        'Pairing is one-time — auto-reconnects on future launches',
        '100% LAN · HMAC-SHA256 signed · AES-256 encrypted',
      ],
    },
  ];
  const openURL = (url: string) => {
    try { haptics.medium(); } catch {}
    import('react-native').then(({ Linking }) => Linking.openURL(url).catch(() => {}));
  };

  const AUTO_INSTALLS = [
    { icon: 'language-python',        color: T.cyan,   label: 'Python 3.12+',           sub: 'winget or python.org MSI (silent)' },
    { icon: 'package-variant',        color: T.green,  label: 'All pip packages',        sub: 'psutil · requests · qrcode · pillow · cryptography · beautifulsoup4 · lxml · pywin32 · pyinstaller' },
    { icon: 'robot-happy',            color: T.purple, label: 'Ollama AI',               sub: 'winget or ollama.com silent installer' },
    { icon: 'brain',                  color: T.amber,  label: 'qwen2.5-coder:7b model', sub: 'Apache 2.0 · commercial OK · ~4GB · auto-pulled' },
    { icon: 'desktop-tower-monitor',  color: T.green,  label: 'Desktop shortcut',        sub: 'One-click server launch on PC' },
  ];

  return (
    <View style={{ gap: 12 }}>
      {/* ── OVERVIEW BANNER ── */}
      <NeonCard color={accent}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
          <MaterialCommunityIcons name="lightning-bolt" size={16} color={accent} />
          <Text style={{ fontSize:13, fontWeight:'900', fontFamily:MONO, color:accent }}>3 STEPS · PAIR IN UNDER 60 SECONDS</Text>
        </View>
        <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17 }}>
          Most users are up and running in under 2 minutes. The one-click installer handles Python, Ollama, and all dependencies automatically.
        </Text>
        <View style={{ flexDirection:'row', gap:6, marginTop:10, flexWrap:'wrap' }}>
          {['PYTHON 3.12+','OLLAMA AI','HMAC-SHA256','AES-256','ZERO CLOUD','LAN ONLY'].map((b,i) => (
            <View key={i} style={{ borderWidth:1, borderRadius:6, paddingHorizontal:7, paddingVertical:3, borderColor:[T.cyan,T.green,T.amber,T.purple,T.green,T.cyan][i]+'40', backgroundColor:[T.cyan,T.green,T.amber,T.purple,T.green,T.cyan][i]+'08' }}>
              <Text style={{ fontFamily:MONO, fontSize:8.5, color:[T.cyan,T.green,T.amber,T.purple,T.green,T.cyan][i]+'CC', fontWeight:'900' }}>{b}</Text>
            </View>
          ))}
        </View>
      </NeonCard>

      {/* ── AUTO-INSTALL BANNER ── */}
      <View style={{ borderWidth:1.5, borderRadius:14, borderColor:T.green+'45', backgroundColor:'#050810', overflow:'hidden' }}>
        <View style={{ height:3, backgroundColor:T.green }} />
        <View style={{ paddingHorizontal:16, paddingTop:12, paddingBottom:4 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
            <MaterialCommunityIcons name="lightning-bolt" size={14} color={T.green} />
            <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:T.green, letterSpacing:1 }}>INSTALLS EVERYTHING AUTOMATICALLY</Text>
          </View>
          {AUTO_INSTALLS.map((a,i) => (
            <View key={i} style={{ flexDirection:'row', alignItems:'flex-start', gap:10, paddingVertical:8, borderBottomWidth: i < AUTO_INSTALLS.length-1 ? 1 : 0, borderBottomColor:'rgba(255,255,255,0.06)' }}>
              <View style={{ width:36, height:36, borderRadius:10, borderWidth:1.5, borderColor:a.color+'45', backgroundColor:a.color+'10', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <MaterialCommunityIcons name={a.icon as any} size={17} color={a.color} />
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:13, fontWeight:'700', color:'#FFF', marginBottom:2 }}>{a.label}</Text>
                <Text style={{ fontFamily:MONO, fontSize:9, color:T.textMid, lineHeight:13 }}>{a.sub}</Text>
              </View>
            </View>
          ))}
        </View>
        {/* Platform download buttons */}
        <View style={{ flexDirection:'row', gap:8, paddingHorizontal:14, paddingBottom:14, marginTop:4 }}>
          <TouchableOpacity onPress={() => openURL('https://github.com/shawnjan-cmd/butler-server/releases/latest')} activeOpacity={0.85}
            style={{ flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#4A9EFF', borderRadius:12, borderWidth:1.5, borderColor:T.cyan+'55', padding:11 }}>
            <MaterialIcons name="computer" size={20} color={T.cyan} />
            <View>
              <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:T.cyan }}>WINDOWS</Text>
              <Text style={{ fontFamily:MONO, fontSize:8.5, color:T.textMid }}>PowerShell .ps1 script</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openURL('https://github.com/shawnjan-cmd/butler-server/releases/latest')} activeOpacity={0.85}
            style={{ flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#0B0F17', borderRadius:12, borderWidth:1.5, borderColor:T.green+'55', padding:11 }}>
            <MaterialCommunityIcons name="apple" size={20} color={T.green} />
            <View>
              <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:T.green }}>MAC / LINUX</Text>
              <Text style={{ fontFamily:MONO, fontSize:8.5, color:T.textMid }}>Bash .sh script</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={{ fontFamily:MONO, fontSize:9, color:T.textMid, textAlign:'center', paddingBottom:12, lineHeight:14 }}>
          {'One script = Python + all packages + Ollama + AI model + shortcut'}
        </Text>
      </View>

      {/* ── 3 NUMBERED STEP CARDS ── */}
      {STEPS.map((step, i) => (
        <View key={step.num}>
          {i > 0 && (
            <View style={{ alignItems:'center', height:18 }}>
              <View style={{ width:2, height:'100%', backgroundColor:STEPS[i-1].color+'35' }} />
            </View>
          )}
          <View style={[ps.stepCard, { borderColor:step.color+'50', borderLeftColor:step.color }]}>
            <HudCorners color={step.color+'35'} size={8} t={1} />
            <View style={[ps.topAccent, { backgroundColor:step.color }]} />
            <View style={{ flexDirection:'row', alignItems:'flex-start', gap:14, padding:14, paddingTop:16 }}>
              <View style={[ps.stepBadge, { borderColor:step.color, backgroundColor:step.color+'18' }]}>
                <Text style={{ fontSize:20, fontWeight:'900', fontFamily:MONO, color:step.color }}>{step.num}</Text>
              </View>
              <View style={{ flex:1 }}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                  <MaterialCommunityIcons name={step.icon as any} size={14} color={step.color} />
                  <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:'#FFF', flex:1 }}>{step.title}</Text>
                  <View style={{ width:7, height:7, borderRadius:3.5, backgroundColor:step.color, opacity:0.8 }} />
                </View>
                <Text style={{ fontSize:11, fontFamily:MONO, color:T.textMid, lineHeight:17, marginBottom:8 }}>{step.desc}</Text>
                {step.bullets.map((b,bi) => (
                  <View key={bi} style={{ flexDirection:'row', alignItems:'flex-start', gap:8, marginBottom:5 }}>
                    <View style={{ width:5, height:5, borderRadius:2.5, backgroundColor:step.color, marginTop:5, flexShrink:0 }} />
                    <Text style={{ fontFamily:MONO, fontSize:10, color:step.color+'BB', lineHeight:15, flex:1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
            {/* Segmented accent bar at bottom */}
            <View style={{ flexDirection:'row', gap:3, paddingHorizontal:14, paddingBottom:10 }}>
              {Array.from({length:16}).map((_,si) => (
                <View key={si} style={{ flex:1, height:2.5, borderRadius:2, backgroundColor:step.color+(si%3===0?'80':'20') }} />
              ))}
            </View>
          </View>
        </View>
      ))}

      {/* ── DOWNLOAD BUTTONS ── */}
      <SectionHdr label="DOWNLOAD SERVER" color={accent} icon="download" />
      <TouchableOpacity onPress={() => openURL('https://github.com/shawnjan-cmd/butler-server/releases/latest')} activeOpacity={0.85}
        style={[ps.qrBtn, { backgroundColor: T.cyan, marginBottom:6 }]}>
        <MaterialCommunityIcons name="github" size={26} color="#000" />
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:14, fontWeight:'900', fontFamily:MONO, color:'#000' }}>DOWNLOAD FROM GITHUB</Text>
          <View style={{ flexDirection:'row', gap:5, marginTop:3 }}>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>● GITHUB</Text></View>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>FREE</Text></View>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>PYTHON 3.10+</Text></View>
          </View>
        </View>
        <MaterialIcons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openURL(`mailto:?subject=Butler AI Server Setup&body=Download butler_server.py from: https://github.com/shawnjan-cmd/butler-server/releases/latest%0A%0ASetup guide: https://shawnjan-cmd.github.io/privacy-policy-/%0A%0AQuick start:%0A1. Save butler_server.py to your PC%0A2. Run: python butler_server.py%0A3. Scan the QR code shown in terminal%0A%0ARequires Python 3.10+. All other packages install automatically.`)} activeOpacity={0.85}
        style={[ps.qrBtn, { backgroundColor: T.purple, marginBottom:8 }]}>
        <MaterialIcons name="email" size={26} color="#000" />
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:14, fontWeight:'900', fontFamily:MONO, color:'#000' }}>SEND TO YOUR EMAIL</Text>
          <View style={{ flexDirection:'row', gap:5, marginTop:3 }}>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>● 1-CLICK SETUP</Text></View>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>PRE-FILLED</Text></View>
            <View style={{ backgroundColor:'rgba(0,0,0,0.2)', borderRadius:4, paddingHorizontal:6, paddingVertical:2 }}><Text style={{ fontFamily:MONO, fontSize:8.5, color:'#000', fontWeight:'900' }}>FULL GUIDE</Text></View>
          </View>
        </View>
        <MaterialIcons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openURL('https://github.com/shawnjan-cmd/butler-server/archive/refs/heads/main.zip')} activeOpacity={0.85}
        style={[ps.qrBtn, { backgroundColor: T.amber, marginBottom:10 }]}>
        <MaterialIcons name="download" size={26} color="#000" />
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:14, fontWeight:'900', fontFamily:MONO, color:'#000' }}>AUTO-DOWNLOAD .ZIP</Text>
          <Text style={{ fontSize:9, fontFamily:MONO, color:'rgba(0,0,0,0.65)', marginTop:2 }}>Direct archive — no GitHub account needed</Text>
        </View>
        <MaterialIcons name="arrow-downward" size={18} color="#000" />
      </TouchableOpacity>

      {/* ── AUTHENTICATE / SCAN QR CARD ── */}
      <View style={{ borderWidth:1.5, borderRadius:14, borderColor:T.cyan+'45', backgroundColor:'#0B0F17', overflow:'hidden' }}>
        <View style={{ height:3, backgroundColor:T.cyan }} />
        <View style={{ padding:14 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:12 }}>
            <MaterialCommunityIcons name="shield-check" size={14} color={T.cyan} />
            <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:T.cyan, letterSpacing:1 }}>AUTHENTICATE DEVICE</Text>
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:10 }}>
            <View style={{ width:34, height:34, borderRadius:8, borderWidth:2, borderColor:T.cyan+'60', backgroundColor:T.cyan+'10', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Text style={{ fontFamily:MONO, fontSize:13, fontWeight:'900', color:T.cyan }}>1</Text>
            </View>
            <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:'#FFF' }}>SCAN QR CODE</Text>
          </View>
          <TouchableOpacity onPress={() => { try { haptics.heavy(); } catch {}; onScanQR(); }} activeOpacity={0.85}
            style={[ps.qrBtn, { backgroundColor: T.green, marginBottom:0, borderRadius:12 }]}>
            <MaterialIcons name="qr-code-scanner" size={26} color="#000" />
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:14, fontWeight:'900', fontFamily:MONO, color:'#000' }}>OPEN QR SCANNER</Text>
              <Text style={{ fontSize:9, fontFamily:MONO, color:'rgba(0,0,0,0.6)', marginTop:2 }}>Point camera at desktop QR code to pair instantly</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={18} color="#000" />
          </TouchableOpacity>
          <View style={{ alignItems:'center', paddingVertical:8 }}>
            <Text style={{ fontFamily:MONO, fontSize:9, color:T.textMid, letterSpacing:1 }}>← → MANUAL CONNECT</Text>
          </View>
          <View style={{ borderRadius:10, borderWidth:1, borderColor:T.border, backgroundColor:T.surface, paddingHorizontal:12, paddingVertical:10 }}>
            <Text style={{ fontFamily:MONO, fontSize:10, color:T.textDim, lineHeight:15 }}>
              Enter PC IP : Persists across app restarts · No cloud relay
            </Text>
          </View>
        </View>
      </View>

      {/* ── SECURITY AUDIT SUMMARY ── */}
      <View style={{ borderRadius:14, borderWidth:1.5, borderColor:T.green+'35', backgroundColor:'#050810', overflow:'hidden' }}>
        <View style={{ height:2.5, backgroundColor:T.green+'70' }} />
        <View style={{ padding:14 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
            <MaterialCommunityIcons name="shield-lock" size={14} color={T.green} />
            <Text style={{ fontFamily:MONO, fontSize:10, fontWeight:'900', color:T.green, letterSpacing:1 }}>SECURITY AUDIT SUMMARY</Text>
          </View>
          {[
            { label:'Telemetry', val:'0 requests', ok:true },
            { label:'Cloud Deps', val:'None', ok:true },
            { label:'Encryption', val:'AES-256-GCM', ok:true },
            { label:'Auth', val:'HMAC-SHA256', ok:true },
          ].map((s,i) => (
            <View key={i} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i<3 ? 1 : 0, borderBottomColor:'rgba(0,255,136,0.08)' }}>
              <MaterialIcons name="check-circle" size={13} color={T.green} style={{ marginRight:8 }} />
              <Text style={{ fontFamily:MONO, fontSize:10, color:T.textMid, flex:1 }}>{s.label}</Text>
              <Text style={{ fontFamily:MONO, fontSize:10, color:T.green, fontWeight:'900' }}>{s.val}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
const ps = StyleSheet.create({
  stepCard:  { borderWidth:2, borderLeftWidth:5, borderRadius:14, backgroundColor:'#0B0F17', overflow:'hidden', marginBottom:2, position:'relative' },
  topAccent: { height:3 },
  stepBadge: { width:52, height:52, borderRadius:14, borderWidth:2.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  qrBtn:     { flexDirection:'row', alignItems:'center', gap:14, padding:16, borderRadius:14, overflow:'hidden' },
});

function PageSignature({ idx, accent }: { idx: number; accent: string }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  const spin  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue:1, duration:1000, useNativeDriver:ND }),
      Animated.timing(pulse, { toValue:0.3, duration:1000, useNativeDriver:ND }),
    ]));
    const s = Animated.loop(Animated.timing(spin, { toValue:1, duration:8000, useNativeDriver:ND }));
    p.start(); s.start();
    return () => { p.stop(); s.stop(); };
  }, []);
  const rotDeg = spin.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] });

  if (idx === 9) {
    return (
      <View style={[sig.strip, { borderColor: accent+'50', backgroundColor: accent+'06', paddingVertical:12, paddingHorizontal:14, marginBottom:10 }]}>
        <View style={[sig.stripBar, { backgroundColor: accent }]} />
        <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
          <Animated.View style={{ transform:[{rotate:rotDeg}] }}>
            <MaterialCommunityIcons name="rocket-launch" size={32} color={accent} />
          </Animated.View>
          <View style={{ flex:1 }}>
            <Text style={{ fontFamily:MONO, fontSize:13, fontWeight:'900', color:accent, letterSpacing:2 }}>MISSION COMPLETE · BUTLER ARMED</Text>
            <View style={{ flexDirection:'row', gap:4, marginTop:5 }}>
              {[T.cyan,T.green,T.amber,T.purple,T.green].map((col,i)=>(
                <Animated.View key={i} style={{ flex:1, height:4, borderRadius:2, backgroundColor:col, opacity:pulse.interpolate({inputRange:[0.3,1],outputRange:[i%2===0?1:0.3,i%2===0?0.3:1]}) }} />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }
  return null;
}
const sig = StyleSheet.create({
  strip:    { borderWidth:1.5, borderRadius:12, backgroundColor:T.surface, overflow:'hidden', position:'relative' },
  stripBar: { height:3 },
});

function LaunchPage({ accent }: { accent: string }) {
  const engageGlow  = useRef(new Animated.Value(0.35)).current;
  const engageScale = useRef(new Animated.Value(1)).current;
  const ringRot     = useRef(new Animated.Value(0)).current;
  const barPulse    = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const g  = Animated.loop(Animated.sequence([
      Animated.timing(engageGlow, { toValue:1, duration:900, useNativeDriver:ND }),
      Animated.timing(engageGlow, { toValue:0.2, duration:900, useNativeDriver:ND }),
    ]));
    const s  = Animated.loop(Animated.sequence([
      Animated.timing(engageScale, { toValue:1.018, duration:1100, useNativeDriver:ND }),
      Animated.timing(engageScale, { toValue:0.994, duration:1100, useNativeDriver:ND }),
    ]));
    const r  = Animated.loop(Animated.timing(ringRot, { toValue:1, duration:6000, useNativeDriver:ND }));
    const bp = Animated.loop(Animated.sequence([
      Animated.timing(barPulse, { toValue:1, duration:1200, useNativeDriver:ND }),
      Animated.timing(barPulse, { toValue:0, duration:1200, useNativeDriver:ND }),
    ]));
    g.start(); s.start(); r.start(); bp.start();
    return () => { g.stop(); s.stop(); r.stop(); bp.stop(); };
  }, []);
  const rotDeg = ringRot.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] });
  const CHECKS = [
    { color:T.cyan,   text:'Privacy Policy accepted — device UUID only' },
    { color:T.amber,  text:'Terms of Service accepted — lawful use only' },
    { color:T.danger, text:'Safety Pledge signed — no unauthorised access' },
    { color:T.green,  text:'Server privacy understood — 100% local' },
    { color:T.purple, text:'Permissions reviewed — camera for QR only' },
    { color:T.green,  text:'Zero telemetry · Zero cloud · 100% your hardware' },
  ];
  let _SHIELD: any = null;
  try { _SHIELD = require('@/assets/images/butler-ai-shield-logo.jpg'); } catch {
    try { _SHIELD = require('@/assets/images/nexus-robot-mascot.png'); } catch {}
  }
  const BAR_COLORS = [T.cyan, T.amber, T.purple, T.green, T.danger];
  return (
    <View style={{ gap: 14 }}>
      <View style={[lp.systemsGoBanner, { borderColor: accent + '60' }]}>
        <HudCorners color={accent + '80'} size={8} t={1.5} />
        <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
          <MaterialCommunityIcons name="gesture-tap" size={26} color={accent} />
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:12, fontWeight:'900', fontFamily:MONO, color:accent, letterSpacing:1.5 }}>TAP ANY TAB ICON BELOW TO ENTER</Text>
            <View style={{ flexDirection:'row', gap:3, marginTop:6 }}>
              {BAR_COLORS.map((col, i) => (
                <Animated.View key={i} style={{ flex:1, height:4, borderRadius:2, backgroundColor:col, opacity: barPulse.interpolate({ inputRange:[0,1], outputRange:[i%2===0?1:0.3, i%2===0?0.3:1] }) }} />
              ))}
            </View>
          </View>
        </View>
      </View>
      <View style={{ alignItems:'center', paddingVertical:8 }}>
        <View style={{ width:200, height:200, alignItems:'center', justifyContent:'center', position:'relative' }}>
          <Animated.View style={{ position:'absolute', width:200, height:200, borderRadius:100, borderWidth:1.5, borderColor:accent+'40', borderStyle:'dashed', transform:[{rotate:rotDeg}] }} />
          <Animated.View style={[lp.shieldWrap, { borderColor:accent, transform:[{scale:engageScale}] }]}>
            {_SHIELD ? <Image source={_SHIELD} style={{ width:150, height:150 }} contentFit="cover" /> : <MaterialCommunityIcons name="robot-happy" size={80} color={accent} />}
            <Animated.View style={[lp.liveOrb, { backgroundColor:accent, opacity:engageGlow }]} />
          </Animated.View>
        </View>
        <Text style={{ fontSize:18, fontWeight:'900', fontFamily:MONO, color:'#FFF', letterSpacing:3, marginTop:12 }}>INITIATE BUTLER AI</Text>
        <Text style={{ fontSize:10, fontFamily:MONO, color:accent+'90', letterSpacing:1.5, marginTop:4 }}>ALL AGREEMENTS SAVED · READY TO LAUNCH</Text>
      </View>
      <Animated.View style={[lp.tapTabsCard, { borderColor: accent, transform:[{scale:engageScale}] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius:20, backgroundColor:accent, opacity:engageGlow.interpolate({inputRange:[0.2,1],outputRange:[0.04,0.12]}) }]} />
        <HudCorners color={accent} size={14} t={2} />
        <Animated.View style={{ height:2.5, backgroundColor:accent, opacity:engageGlow }} />
        <View style={{ paddingVertical:24, paddingHorizontal:18, alignItems:'center', gap:14 }}>
          <Animated.View style={{ transform:[{scale:engageScale}] }}>
            <MaterialCommunityIcons name="gesture-tap" size={52} color={accent} />
          </Animated.View>
          <Text style={{ fontSize:28, fontWeight:'900', fontFamily:MONO, color:accent, letterSpacing:3, textAlign:'center' }}>TAP A TAB BELOW</Text>
          <Text style={{ fontSize:11, fontFamily:MONO, color:accent+'CC', letterSpacing:1.5, textAlign:'center', lineHeight:18 }}>
            {'Pick any icon from the tab bar\nto enter your NEXUS command center'}
          </Text>
          <View style={{ flexDirection:'row', gap:8, marginTop:4 }}>
            {(['home-variant','code-braces','robot-happy','brain','monitor-dashboard','wrench'] as const).map((icon, i) => (
              <Animated.View key={i} style={{ opacity: engageGlow.interpolate({inputRange:[0.2,1], outputRange:[i%2===0?0.45:0.9, i%2===0?0.9:0.45]}) }}>
                <View style={[lp.miniTabIcon, { borderColor: accent+'55', backgroundColor: accent+'12' }]}>
                  <MaterialCommunityIcons name={icon as any} size={17} color={accent} />
                </View>
              </Animated.View>
            ))}
          </View>
          <Text style={{ fontSize:9.5, fontFamily:MONO, color:accent+'70', letterSpacing:2, marginTop:4 }}>CORE · OPS · BUTLR · KB · INTEL · FORGE</Text>
        </View>
        <Animated.View style={{ height:2.5, backgroundColor:accent, opacity:engageGlow }} />
      </Animated.View>
      <View style={[lp.checklistCard, { borderColor:accent+'40' }]}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
          <MaterialCommunityIcons name="shield-check" size={14} color={T.green} />
          <Text style={{ fontSize:10, fontWeight:'900', fontFamily:MONO, color:T.green, letterSpacing:1 }}>AGREEMENTS ON RECORD</Text>
        </View>
        {CHECKS.map((c, i) => (
          <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:5, borderBottomWidth:i<CHECKS.length-1?StyleSheet.hairlineWidth:0, borderBottomColor:'rgba(255,255,255,0.06)' }}>
            <MaterialIcons name="check-circle" size={14} color={c.color} />
            <Text style={{ flex:1, fontSize:11, fontFamily:MONO, color:T.text, lineHeight:16 }}>{c.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const lp = StyleSheet.create({
  systemsGoBanner: { borderWidth:2, borderRadius:14, backgroundColor:'#050810', padding:14, overflow:'hidden', position:'relative' },
  shieldWrap:   { width:155, height:155, borderRadius:24, borderWidth:3, alignItems:'center', justifyContent:'center', overflow:'hidden', backgroundColor:'#000' },
  liveOrb:      { position:'absolute', bottom:8, right:8, width:12, height:12, borderRadius:6, borderWidth:2, borderColor:'#000' },
  tapTabsCard:   { borderWidth:3, borderRadius:20, backgroundColor:'#050810', overflow:'hidden', position:'relative' },
  miniTabIcon:   { width:36, height:36, borderRadius:10, borderWidth:1.5, alignItems:'center', justifyContent:'center' },
  checklistCard:{ borderWidth:1.5, borderRadius:14, padding:14, backgroundColor:T.surface },
  engageOuter:  { borderWidth:3, borderRadius:20, backgroundColor:'#050810', overflow:'hidden', position:'relative' },
});

// ─── INLINE BROWSER ────────────────────────────────────────────────
function InlineBrowser({ visible, url, title, accent, onClose }: { visible:boolean; url:string; title:string; accent:string; onClose:()=>void }) {
  if (!visible) return null;
  const [WebView, setWebView] = useState<any>(null);
  useEffect(() => {
    if (visible) { import('react-native-webview').then(m => setWebView(() => m.WebView)).catch(() => {}); }
  }, [visible]);
  const handleOpenExternal = useCallback(() => {
    import('react-native').then(({ Linking }) => Linking.openURL(url).catch(() => {}));
  }, [url]);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor:T.bg, zIndex:9999 }]}>
      <View style={[ib.header, { borderBottomColor:accent+'30' }]}>
        <TouchableOpacity onPress={onClose} style={ib.closeBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <MaterialIcons name="arrow-back" size={20} color={accent} />
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={[ib.title, { color:accent }]} numberOfLines={1}>{title}</Text>
        </View>
        <TouchableOpacity onPress={handleOpenExternal} style={ib.extBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <MaterialIcons name="open-in-new" size={16} color={accent} />
        </TouchableOpacity>
      </View>
      {WebView ? (
        <WebView source={{ uri: url }} style={{ flex:1, backgroundColor:T.bg }} />
      ) : (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:16 }}>
          <MaterialIcons name="language" size={48} color={T.textMid} />
          <Text style={{ fontSize:13, fontFamily:MONO, color:T.textMid, textAlign:'center', paddingHorizontal:32, lineHeight:20 }}>
            Loading...{'\n'}Or tap \u2197 above to open in browser.
          </Text>
        </View>
      )}
    </View>
  );
}
const ib = StyleSheet.create({
  header:   { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingTop:Platform.OS==='ios'?54:32, paddingBottom:12, borderBottomWidth:1, backgroundColor:T.surface },
  closeBtn: { width:38, height:38, borderRadius:10, backgroundColor:T.surfHi, alignItems:'center', justifyContent:'center' },
  title:    { fontSize:13, fontWeight:'900', fontFamily:MONO, letterSpacing:0.5 },
  url:      { fontSize:8.5, fontFamily:MONO, color:T.textMid, marginTop:1 },
  extBtn:   { width:38, height:38, alignItems:'center', justifyContent:'center' },
});

// ─── QR SCANNER MODAL ──────────────────────────────────────────────
function QRScanModal({ visible, onClose, onPaired }: { visible:boolean; onClose:()=>void; onPaired:()=>void }) {
  const [scanMsg, setScanMsg] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, setPermission] = useState<any>(null);
  const [CameraView, setCameraView] = useState<any>(null);
  const doneRef = useRef(false);
  useEffect(() => {
    if (visible) {
      doneRef.current = false; setScanMsg(''); setScanning(false);
      import('expo-camera').then(m => {
        setCameraView(() => m.CameraView);
        m.Camera.requestCameraPermissionsAsync().then(p => setPermission(p));
      }).catch(() => setScanMsg('Camera not available'));
    }
  }, [visible]);
  const handleScan = useCallback(async ({ data }: { data: string }) => {
    if (doneRef.current || scanning) return;
    doneRef.current = true; setScanning(true);
    try { haptics.medium(); } catch {}
    try {
      const { parseQRConnection } = await import('@/services/qrParser');
      const parsed = parseQRConnection(data) as any;
      if (!parsed) { setScanMsg('Invalid QR'); setScanning(false); doneRef.current = false; return; }
      setScanMsg(`Connecting to ${parsed.ip}:${parsed.port}\u2026`);
      const { serverConnection } = await import('@/services/serverConnection');
      const result = await serverConnection.pair(parsed.ip, String(parsed.port), parsed.pairingCode || '', false, parsed.appSig || '');
      if (!result.success) throw new Error(result.error || 'Pair failed');
      setScanMsg('Connected! \u2713'); try { haptics.success(); } catch {}
      setTimeout(() => { onClose(); onPaired(); }, 900);
    } catch (e: any) {
      setScanMsg(`Failed: ${e?.message || 'Connection error'}`);
      setScanning(false); doneRef.current = false;
    }
  }, [scanning, onClose, onPaired]);
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor:'#000', zIndex:9999 }]}>
      <View style={qrs.header}>
        <TouchableOpacity onPress={onClose} style={qrs.closeBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <MaterialIcons name="arrow-back" size={20} color={T.cyan} />
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={qrs.title}>SCAN QR TO PAIR</Text>
          <Text style={qrs.sub}>Show QR code from your PC server terminal</Text>
        </View>
        <View style={{ width:40 }} />
      </View>
      {permission?.granted && CameraView ? (
        <View style={{ flex:1 }}>
          <CameraView style={{ flex:1 }} facing="back" onBarcodeScanned={scanning ? undefined : handleScan} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)' }} />
              <View style={{ flexDirection:'row', height:240 }}>
                <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)' }} />
                <View style={{ width:240 }}>
                  {[{top:0,left:0,bT:3,bL:3},{top:0,right:0,bT:3,bR:3},{bottom:0,left:0,bB:3,bL:3},{bottom:0,right:0,bB:3,bR:3}].map((c:any,i)=>(
                    <View key={i} style={{ position:'absolute', width:28, height:28, borderColor:T.cyan, ...(c.top!==undefined?{top:c.top}:{bottom:c.bottom}), ...(c.left!==undefined?{left:c.left}:{right:c.right}), borderTopWidth:c.bT||0, borderLeftWidth:c.bL||0, borderBottomWidth:c.bB||0, borderRightWidth:c.bR||0 }} />
                  ))}
                </View>
                <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)' }} />
              </View>
              <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)' }} />
            </View>
          </CameraView>
        </View>
      ) : (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:32, gap:16 }}>
          <MaterialIcons name="camera-alt" size={52} color={T.textMid} />
          <Text style={{ fontSize:16, fontWeight:'900', fontFamily:MONO, color:T.text, textAlign:'center' }}>Camera Access Needed</Text>
          {permission && !permission.granted && (
            <TouchableOpacity onPress={() => import('react-native').then(({Linking})=>Linking.openSettings())}
              style={[qrs.permBtn, { backgroundColor:T.cyan }]}>
              <Text style={{ fontSize:13, fontWeight:'900', fontFamily:MONO, color:'#000' }}>OPEN SETTINGS</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {scanMsg ? (
        <View style={[qrs.msgBox, { borderColor: scanMsg.includes('\u2713') ? T.green+'60' : scanMsg.includes('Failed') ? T.danger+'60' : T.amber+'60' }]}>
          <MaterialIcons name={scanMsg.includes('\u2713') ? 'check-circle' : scanMsg.includes('Failed') ? 'error' : 'info'} size={14}
            color={scanMsg.includes('\u2713') ? T.green : scanMsg.includes('Failed') ? T.danger : T.amber} />
          <Text style={[qrs.msgTxt, { color: scanMsg.includes('\u2713') ? T.green : scanMsg.includes('Failed') ? T.danger : T.amber }]}>{scanMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}
const qrs = StyleSheet.create({
  header:  { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingTop:Platform.OS==='ios'?54:32, paddingBottom:14, backgroundColor:T.bg, borderBottomWidth:1, borderBottomColor:T.border },
  closeBtn:{ width:40, height:40, borderRadius:12, backgroundColor:T.surface, alignItems:'center', justifyContent:'center' },
  title:   { fontSize:13, fontWeight:'900', fontFamily:MONO, color:T.text, letterSpacing:1.5 },
  sub:     { fontSize:9, fontFamily:MONO, color:T.textMid, marginTop:2 },
  permBtn: { borderRadius:12, paddingHorizontal:28, paddingVertical:14, marginTop:8 },
  msgBox:  { flexDirection:'row', alignItems:'center', gap:8, margin:14, padding:14, borderRadius:12, borderWidth:1.5, backgroundColor:T.surface },
  msgTxt:  { fontFamily:MONO, fontSize:12, flex:1 },
});

// ─── PROGRESS BAR ──────────────────────────────────────────────────
function ProgressBar({ idx, accent }: { idx: number; accent: string }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: ((idx + 1) / TOTAL) * 100, duration: 380, useNativeDriver: ND }).start();
  }, [idx]);
  const width = widthAnim.interpolate({ inputRange:[0,100], outputRange:['0%','100%'] });
  return (
    <View style={{ height:3.5, backgroundColor:T.surfHi, overflow:'hidden', borderRadius:2 }}>
      <Animated.View style={{ height:'100%', borderRadius:2, width: width as any, backgroundColor: accent }} />
    </View>
  );
}

// ─── NAV BAR ───────────────────────────────────────────────────────
function NavBar({ idx, isFirst, isLast, nextDisabled, insetBottom, accent, onBack, onNext, onFinish }: {
  idx:number; isFirst:boolean; isLast:boolean; nextDisabled:boolean;
  insetBottom:number; accent:string;
  onBack:()=>void; onNext:()=>void; onFinish:()=>void;
}) {
  return (
    <View style={[nav.wrap, { paddingBottom: Math.max(insetBottom + 6, 10), borderTopColor: accent + '28' }]}>
      <View style={nav.row}>
        <TouchableOpacity onPress={() => { try { haptics.light(); } catch {} onBack(); }} disabled={isFirst} activeOpacity={0.8}
          hitSlop={{top:8,bottom:8,left:8,right:8}}
          style={[nav.backBtn, { borderColor: isFirst ? T.textDim+'20' : accent+'50', opacity: isFirst ? 0.2 : 1 }]}>
          <MaterialIcons name="chevron-left" size={22} color={isFirst ? T.textDim : accent} />
          <Text style={[nav.backTxt, { color: isFirst ? T.textDim : accent }]}>BACK</Text>
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:'center' }}>
          <Text style={[nav.counter, { color: accent }]}>{idx + 1}</Text>
          <Text style={nav.counterOf}>OF {TOTAL}</Text>
        </View>
        {isLast ? (
          <TouchableOpacity onPress={() => { try { haptics.success(); } catch {} onFinish(); }} activeOpacity={0.85}
            style={[nav.nextBtn, { backgroundColor: accent }]}>
            <MaterialIcons name="check" size={18} color="#000" />
            <Text style={[nav.nextTxt, { color:'#000' }]}>FINISH</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { if (!nextDisabled) { try { haptics.medium(); } catch {} onNext(); } }}
            disabled={nextDisabled} activeOpacity={nextDisabled ? 1 : 0.85}
            style={[nav.nextBtn, { backgroundColor: nextDisabled ? T.surfHi : accent, opacity: nextDisabled ? 0.5 : 1 }]}>
            <Text style={[nav.nextTxt, { color: nextDisabled ? T.textMid : '#000' }]}>NEXT</Text>
            <MaterialIcons name="chevron-right" size={18} color={nextDisabled ? T.textMid : '#000'} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const nav = StyleSheet.create({
  wrap:     { borderTopWidth:1, paddingHorizontal:12, paddingTop:7, backgroundColor:T.bg },
  row:      { flexDirection:'row', alignItems:'center', gap:10, paddingBottom:4 },
  backBtn:  { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1.5, borderRadius:20, paddingVertical:10, paddingHorizontal:13, minWidth:74, justifyContent:'center' },
  backTxt:  { fontSize:10, fontWeight:'900', fontFamily:MONO, letterSpacing:0.8 },
  counter:  { fontSize:24, fontWeight:'900', fontFamily:MONO, lineHeight:28 },
  counterOf:{ fontSize:10, fontWeight:'700', fontFamily:MONO, color:T.textMid },
  nextBtn:  { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderRadius:20, paddingVertical:12, paddingHorizontal:18, minWidth:100 },
  nextTxt:  { fontSize:12, fontWeight:'900', fontFamily:MONO, letterSpacing:1 },
});

// ─── ONBOARDING ERROR BOUNDARY ────────────────────────────────
// If the onboarding screen crashes during render (corrupted state,
// missing asset, JS error), this catches it and shows a minimal
// escape hatch that writes all completion keys and navigates home.
// The user is never left on a black screen.
class OnboardingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean; errMsg: string }
> {
  state = { crashed: false, errMsg: '' };

  static getDerivedStateFromError(e: Error) {
    return { crashed: true, errMsg: e?.message || 'Unknown error' };
  }

  componentDidCatch(e: Error) {
    // Write the done key silently so even if navigation fails,
    // the next cold boot skips onboarding
    try { markOnboardingDone().catch(() => {}); } catch {}
    try { notifyOnboardingComplete(); } catch {}
    try {
      require('@/services/autoErrorLogger').autoErrorLogger
        .log('error', 'OnboardingScreen', e.message);
    } catch {}
  }

  handleEscape = async () => {
    try { await markOnboardingDone(); } catch {}
    try { await AsyncStorage.setItem(POST_ONBOARDING_CHAT_FLAG, '1'); } catch {}
    try { notifyOnboardingComplete(); } catch {}
    forceNavigateToHome();
  };

  render() {
    if (!this.state.crashed) return this.props.children;
    const MONOF: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
    return (
      <View style={{ flex: 1, backgroundColor: '#050810', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        {/* HUD corner brackets */}
        {[{ top:40,left:20 },{ top:40,right:20 },{ bottom:80,left:20 },{ bottom:80,right:20 }].map((pos, i) => (
          <View key={i} style={[
            { position:'absolute', width:18, height:18, borderColor:'rgba(0,229,255,0.45)' },
            pos,
            i===0 && { borderTopWidth:2, borderLeftWidth:2 },
            i===1 && { borderTopWidth:2, borderRightWidth:2 },
            i===2 && { borderBottomWidth:2, borderLeftWidth:2 },
            i===3 && { borderBottomWidth:2, borderRightWidth:2 },
          ]} />
        ))}
        <View style={{ width:72, height:72, borderRadius:36, borderWidth:2, borderColor:'rgba(255,49,49,0.5)', backgroundColor:'rgba(255,49,49,0.08)', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
          <MaterialCommunityIcons name="alert-circle" size={36} color="#FF4D5E" />
        </View>
        <Text style={{ fontFamily:MONOF, fontSize:16, fontWeight:'900', color:'#FF4D5E', letterSpacing:2, textAlign:'center', marginBottom:8 }}>ONBOARDING CRASHED</Text>
        <Text style={{ fontFamily:MONOF, fontSize:10, color:'rgba(100,140,160,0.7)', textAlign:'center', lineHeight:16, marginBottom:24, maxWidth:280 }}>
          {this.state.errMsg.slice(0, 120)}
        </Text>
        <Text style={{ fontFamily:MONOF, fontSize:10, color:'rgba(0,229,255,0.6)', textAlign:'center', marginBottom:20, lineHeight:15 }}>
          {'All your agreements will be saved automatically.\nYou can still use the full app.'}
        </Text>
        <TouchableOpacity
          onPress={this.handleEscape}
          activeOpacity={0.85}
          style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#2FE38A', borderRadius:16, paddingHorizontal:28, paddingVertical:14 }}>
          <MaterialCommunityIcons name="rocket-launch" size={20} color="#000" />
          <Text style={{ fontFamily:MONOF, fontSize:14, fontWeight:'900', color:'#000', letterSpacing:1.5 }}>ENTER APP ANYWAY</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily:MONOF, fontSize:8, color:'rgba(80,100,120,0.5)', marginTop:16, letterSpacing:0.5 }}>Agreements saved · Butler AI v7.3</Text>
      </View>
    );
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
function OnboardingScreenInner() {
  const insets = useSafeAreaInsets();
  const [idx, setIdx]     = useState(0);

  // Stable refs so BackHandler + PanResponder never hold stale closures
  const idxRef  = useRef(idx);
  const goToRef = useRef<(n: number) => void>(() => {});
  useEffect(() => { idxRef.current = idx; }, [idx]);

  // Android hardware back — go to previous onboarding step
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const cur = idxRef.current;
      if (cur > 0) { goToRef.current(cur - 1); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  // Swipe left/right between onboarding pages
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dy) < 50,
      onPanResponderRelease: (_, g) => {
        const cur = idxRef.current;
        if (g.dx < -50 && cur < TOTAL - 1) { try { haptics.light(); } catch {} goToRef.current(cur + 1); }
        else if (g.dx > 50 && cur > 0)    { try { haptics.light(); } catch {} goToRef.current(cur - 1); }
      },
    })
  ).current;
  const [showQR, setShowQR]    = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);

  // ── SCAN-LINE WIPE + INFO BUBBLE ──────────────────────────────────
  const wipeAccentRef   = useRef(PAGES[0].accent);
  const wipeTriggerRef  = useRef<((advancing: boolean, accent: string, cb: () => void) => void) | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleIdx,     setBubbleIdx]     = useState(0);
  const bubbleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBubble = useCallback((nextIdx: number) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubbleIdx(nextIdx);
    setBubbleVisible(true);
    bubbleTimerRef.current = setTimeout(() => setBubbleVisible(false), 4500);
  }, []);

  const dismissBubble = useCallback(() => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubbleVisible(false);
  }, []);

  // Show bubble on first mount
  useEffect(() => {
    const t = setTimeout(() => showBubble(0), 900);
    return () => {
      clearTimeout(t);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, []);

  // NOTE: This screen no longer has a useFocusEffect redirect guard.
  // _layout.tsx is the single source of truth — it holds first paint
  // until AsyncStorage resolves so this screen is never mounted for
  // a returning user. Do NOT re-add useFocusEffect redirect logic here.

  // Publish current step index globally so _layout.tsx can show/hide tab bar
  useEffect(() => {
    (global as any).__butlerOnboardingStepIdx = idx;
    try { (global as any).__butlerUpdateOnboardingStep?.(idx); } catch {}
    if (idx === 9) {
      setTimeout(() => {
        try { (global as any).__butlerRevealTabBar?.(); } catch {}
      }, 500);
    }
  }, [idx]);

  useEffect(() => {
    _triggerCelebration = () => setCelebrationVisible(true);
    return () => { _triggerCelebration = null; };
  }, []);

  const handleCelebrationDone = useCallback(() => {
    setCelebrationVisible(false);
    if (_pendingCelebrationCb) { _pendingCelebrationCb(); _pendingCelebrationCb = null; }
  }, []);

  const [browserVisible, setBrowserVisible] = useState(false);
  const [browserUrl,     setBrowserUrl]     = useState('');
  const [browserTitle,   setBrowserTitle]   = useState('');
  const [consentChecked, setConsentChecked] = useState<Record<string,boolean>>({});
  const [pledgeChecked,  setPledgeChecked]  = useState<Record<string,boolean>>({});
  const launchingRef = useRef(false);

  const fadeAnim   = useRef(new Animated.Value(1)).current;
  const slideAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const scrollRef  = useRef<ScrollView>(null);

  const page        = PAGES[idx];
  const isFirst     = idx === 0;
  const isLast      = idx === TOTAL - 1;
  const allConsents = Object.keys(consentChecked).length === CONSENT_ITEMS.length && Object.values(consentChecked).every(Boolean);
  const allPledges  = Object.keys(pledgeChecked).length === PLEDGE_ITEMS.length && Object.values(pledgeChecked).every(Boolean);
  const nextDisabled = (idx === 2 && !allConsents) || (idx === 3 && !allPledges);

  const openBrowser = useCallback((url: string, title: string) => {
    setBrowserUrl(url); setBrowserTitle(title); setBrowserVisible(true);
    try { haptics.light(); } catch {}
  }, []);

  // Keep goToRef in sync with the latest goTo (defined here, used above via ref)
  const goTo = useCallback((nextIdx: number) => {
    const advancing = nextIdx > idx;
    try { advancing ? haptics.medium() : haptics.light(); } catch {}
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setBubbleVisible(false);
    const pageAccent = PAGES[nextIdx].accent;

    // Use the scan-line wipe if registered, else fall back to original
    if (wipeTriggerRef.current) {
      wipeTriggerRef.current(advancing, pageAccent, () => {
        // Instant content swap at peak coverage — no fade flicker
        fadeAnim.setValue(0);
        slideAnim.setValue(advancing ? 28 : -28);
        scaleAnim.setValue(0.96);
        setIdx(nextIdx);
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 6);
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: ND }),
          Animated.spring(slideAnim, { toValue: 0, tension: 200, friction: 16, useNativeDriver: ND }),
          Animated.spring(scaleAnim, { toValue: 1, tension: 220, friction: 14, useNativeDriver: ND }),
        ]).start(() => {
          // Show tip bubble after content has settled
          setTimeout(() => showBubble(nextIdx), 350);
        });
      });
    } else {
      // Fallback original animation
      const exitX  = advancing ? -40 : 40;
      const enterX = advancing ?  50 : -50;
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,   duration: 90,  useNativeDriver: ND }),
        Animated.timing(slideAnim, { toValue: exitX, duration: 110, useNativeDriver: ND }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 110, useNativeDriver: ND }),
      ]).start(() => {
        slideAnim.setValue(enterX);
        scaleAnim.setValue(0.97);
        setIdx(nextIdx);
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 10);
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: ND }),
          Animated.spring(slideAnim, { toValue: 0, tension: 160, friction: 14, useNativeDriver: ND }),
          Animated.spring(scaleAnim, { toValue: 1, tension: 180, friction: 12, useNativeDriver: ND }),
        ]).start(() => setTimeout(() => showBubble(nextIdx), 350));
      });
    }
  }, [idx, fadeAnim, slideAnim, scaleAnim, showBubble]);
  // Sync goToRef so BackHandler + PanResponder always call the latest version
  useEffect(() => { goToRef.current = goTo; }, [goTo]);

  const finish = useCallback(async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    await persistAndComplete();
    setTimeout(() => { launchingRef.current = false; }, 4000);
  }, []);

  const toggleConsent = useCallback((key: string) => {
    setConsentChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const togglePledge = useCallback((key: string) => {
    setPledgeChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  let _BG: any = null;
  try { _BG = require('@/assets/images/nexus-circuit-grid.jpg'); } catch {}

  return (
    <>
      <NexusCelebrationOverlay visible={celebrationVisible} onDone={handleCelebrationDone} />
      {browserVisible && (
        <InlineBrowser visible={browserVisible} url={browserUrl} title={browserTitle} accent={page.accent} onClose={() => setBrowserVisible(false)} />
      )}
      <QRScanModal visible={showQR} onClose={() => setShowQR(false)} onPaired={finish} />

      <View style={[main.root, { paddingTop: insets.top, backgroundColor: T.bg }]}>
        {/* SCAN-LINE WIPE OVERLAY — must be outside scroll, inside root */}
        <ScanLineWipe triggerRef={wipeTriggerRef} color={page.accent} />
        {_BG && (
          <Image source={_BG} style={[StyleSheet.absoluteFill, { opacity: 0.05 }]} contentFit="cover" pointerEvents="none" />
        )}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {[15,30,45,60,75,90].map(p => (
            <View key={p} style={{ position:'absolute', left:0, right:0, top:`${p}%` as any, height:StyleSheet.hairlineWidth, backgroundColor:'rgba(0,229,255,0.025)' }} />
          ))}
        </View>

        <View style={[main.topBar, { borderBottomColor: page.accent + '28' }]}>
          <ProgressBar idx={idx} accent={page.accent} />
          <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingTop:8, paddingBottom:6 }}>
            <View style={[main.stepPill, { borderColor:page.accent+'55', backgroundColor:page.accent+'10' }]}>
              <PulseDot color={page.accent} size={5} />
              <Text style={{ fontSize:9.5, fontWeight:'900', fontFamily:MONO, color:page.accent, letterSpacing:0.8 }}>{page.label}</Text>
            </View>
            <View style={{ flex:1 }} />
            <SkipHUDButton onSkip={finish} accent={page.accent} pageIdx={idx} />
          </View>
        </View>

        {/* INFO BUBBLE — floats above content, below wipe overlay */}
        <InfoBubble
          visible={bubbleVisible}
          pageIdx={bubbleIdx}
          accent={page.accent}
          onDismiss={dismissBubble}
        />

        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          {/* Left/right page arrows */}
          {idx > 0 && (
            <TouchableOpacity
              onPress={() => { try { haptics.light(); } catch {} goTo(idx - 1); }}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
              style={[onbArrow.btn, { left: 2, borderColor: page.accent + '55', backgroundColor: page.accent + '0C' }]}
              accessibilityLabel="Previous page" accessibilityRole="button"
            >
              <MaterialIcons name="chevron-left" size={26} color={page.accent + '99'} />
            </TouchableOpacity>
          )}
          {idx < TOTAL - 1 && (
            <TouchableOpacity
              onPress={() => { if (!nextDisabled) { try { haptics.light(); } catch {} goTo(idx + 1); } }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
              style={[onbArrow.btn, { right: 2, borderColor: page.accent + '55', backgroundColor: page.accent + '0C', opacity: nextDisabled ? 0.3 : 1 }]}
              accessibilityLabel="Next page" accessibilityRole="button"
            >
              <MaterialIcons name="chevron-right" size={26} color={page.accent + '99'} />
            </TouchableOpacity>
          )}
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 200 }}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }, { scale: scaleAnim }] }}>
              <AmbientPageGlow accent={page.accent} />
              <HoloHeader page={page} idx={idx} />
              <PageSignature idx={idx} accent={page.accent} />
              {idx === 0 && <WelcomePage accent={page.accent} />}
              {idx === 1 && <AppTourPage accent={page.accent} />}
              {idx === 2 && <SafetyConsentPage accent={page.accent} checkedState={consentChecked} onToggle={toggleConsent} allChecked={allConsents} />}
              {idx === 3 && <SafetyPledgePage accent={page.accent} checkedState={pledgeChecked} onToggle={togglePledge} allChecked={allPledges} />}
              {idx === 4 && <LegalPage accent={page.accent} onOpen={openBrowser} />}
              {idx === 5 && <PermissionsPage accent={page.accent} />}
              {idx === 6 && <QAPage accent={page.accent} />}
              {idx === 7 && <ServerPrivacyPage accent={page.accent} />}
              {idx === 8 && <PCSetupPage accent={page.accent} onScanQR={() => setShowQR(true)} />}
              {idx === 9 && <LaunchPage accent={page.accent} />}
            </Animated.View>
          </ScrollView>
        </View>

        <NavBar
          idx={idx} isFirst={isFirst} isLast={isLast} nextDisabled={nextDisabled}
          insetBottom={insets.bottom} accent={page.accent}
          onBack={() => { if (!isFirst) goTo(idx - 1); }}
          onNext={() => { if (!nextDisabled) goTo(idx + 1); }}
          onFinish={finish}
        />
      </View>
    </>
  );
}

// ─── SKIP HUD BYPASS BUTTON ───────────────────────────────────────
// Cinematic HUD-style bypass bar inspired by the nexus pairing bar reference.
// Scan line sweeps left→right. Corner brackets pulse on accent. Triangle warning glyph.
// Completely self-contained — no external deps beyond what onboarding already imports.
function SkipHUDButton({ onSkip, accent, pageIdx }: {
  onSkip: () => void; accent: string; pageIdx: number;
}) {
  const scanX   = useRef(new Animated.Value(-110)).current;
  const glowA   = useRef(new Animated.Value(0.3)).current;
  const scaleA  = useRef(new Animated.Value(1)).current;
  const alertA  = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    // Scan sweep — 3 passes then pause
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(scanX, { toValue: 160, duration: 900, useNativeDriver: ND }),
        Animated.timing(scanX, { toValue: -110, duration: 0,   useNativeDriver: ND }),
        Animated.delay(2800),
      ]),
      { iterations: 6 }
    );
    // Border glow breathe
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowA, { toValue: 1,   duration: 1100, useNativeDriver: ND }),
      Animated.timing(glowA, { toValue: 0.2, duration: 1100, useNativeDriver: ND }),
    ]));
    // Alert triangle blink — starts after 1.5s
    const alert = Animated.loop(Animated.sequence([
      Animated.delay(1500),
      Animated.timing(alertA, { toValue: 1,   duration: 300, useNativeDriver: ND }),
      Animated.timing(alertA, { toValue: 0.2, duration: 300, useNativeDriver: ND }),
    ]));
    sweep.start(); glow.start(); alert.start();
    return () => { sweep.stop(); glow.stop(); alert.stop(); };
  }, []);

  const handlePressIn = () => {
    setPressed(true);
    try { haptics.medium(); } catch {}
    Animated.spring(scaleA, { toValue: 0.93, tension: 400, friction: 10, useNativeDriver: ND }).start();
  };
  const handlePressOut = () => {
    setPressed(false);
    Animated.spring(scaleA, { toValue: 1, tension: 280, friction: 10, useNativeDriver: ND }).start();
  };
  const handlePress = () => {
    try { haptics.success(); } catch {}
    onSkip();
  };

  const borderCol = glowA.interpolate({ inputRange:[0.2,1], outputRange:[accent+'55', accent+'CC'] });
  const alertOp   = alertA.interpolate({ inputRange:[0.2,1], outputRange:[0.25, 1] });

  return (
    <TouchableOpacity
      onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}
      activeOpacity={1} hitSlop={{ top:8, bottom:8, left:6, right:6 }}
    >
      <Animated.View style={[shb.outer, {
        borderColor: borderCol,
        transform: [{ scale: scaleA }],
        backgroundColor: pressed ? accent + '18' : accent + '08',
      }]}>
        {/* Scan sweep */}
        <Animated.View pointerEvents="none"
          style={[shb.scan, { transform:[{ translateX: scanX }] }]} />

        {/* HUD corner brackets */}
        <View style={[shb.corner, { top:1,left:1, borderTopWidth:1.5, borderLeftWidth:1.5, borderColor:accent+'90' }]} />
        <View style={[shb.corner, { top:1,right:1, borderTopWidth:1.5, borderRightWidth:1.5, borderColor:accent+'90' }]} />
        <View style={[shb.corner, { bottom:1,left:1, borderBottomWidth:1.5, borderLeftWidth:1.5, borderColor:accent+'60' }]} />
        <View style={[shb.corner, { bottom:1,right:1, borderBottomWidth:1.5, borderRightWidth:1.5, borderColor:accent+'60' }]} />

        {/* Left: warning alert glyph */}
        <Animated.View style={[shb.alertBox, { borderColor:accent+'50', backgroundColor:accent+'10', opacity:alertOp }]}>
          {/* Triangle (drawn with borders) */}
          <View style={shb.triangle} />
        </Animated.View>

        {/* Dashed divider */}
        <View style={[shb.divider, { borderColor: accent+'40' }]} />

        {/* Center: BYPASS text */}
        <View style={shb.center}>
          <Text style={[shb.bypassLabel, { color: accent+'70' }]}>BYPASS</Text>
          <Text style={[shb.initLabel, { color: accent }]}>INITIALIZATION</Text>
        </View>

        {/* Dashed divider */}
        <View style={[shb.divider, { borderColor: accent+'40' }]} />

        {/* Right: SKIP → */}
        <View style={[shb.rightBox, { borderColor: accent+'55', backgroundColor: accent+'12' }]}>
          <MaterialIcons name="double-arrow" size={12} color={accent} />
          <Text style={[shb.skipTxt, { color: accent }]}>SKIP</Text>
        </View>

        {/* Page counter micro-badge */}
        <View style={[shb.counterBadge, { borderColor: accent+'35' }]}>
          <Text style={[shb.counterTxt, { color: accent+'80' }]}>{pageIdx+1}/{TOTAL}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const shb = StyleSheet.create({
  outer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 10,
    height: 36, overflow: 'hidden',
    position: 'relative', minWidth: 160,
  },
  scan: {
    position: 'absolute', top: 0, bottom: 0, width: 50,
    backgroundColor: 'rgba(255,255,255,0.07)',
    transform: [{ skewX: '-18deg' }],
  },
  corner: { position: 'absolute', width: 7, height: 7, zIndex: 2 },
  alertBox: {
    width: 34, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, marginLeft: 0,
  },
  triangle: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#FFB43D',
  },
  divider: { width: 1, height: '60%', borderLeftWidth: 1, borderStyle: 'dashed' as any },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  bypassLabel: { fontFamily: MONO, fontSize: 6.5, fontWeight: '900', letterSpacing: 1.5, lineHeight: 8 },
  initLabel: { fontFamily: MONO, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8 },
  rightBox: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    height: '100%', paddingHorizontal: 9, borderLeftWidth: 1.5,
  },
  skipTxt: { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  counterBadge: {
    position: 'absolute', bottom: 1, left: 36,
    borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 3, backgroundColor: 'transparent',
  },
  counterTxt: { fontFamily: MONO, fontSize: 6, fontWeight: '900' },
});

const main = StyleSheet.create({
  root:     { flex:1 },
  topBar:   { borderBottomWidth:1, paddingHorizontal:0, paddingTop:6 },
  stepPill: { flexDirection:'row', alignItems:'center', gap:6, borderWidth:1.5, borderRadius:16, paddingHorizontal:10, paddingVertical:5 },
  // skipBtn/skipTxt removed — replaced by SkipHUDButton component
});

const onbArrow = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    zIndex: 10,
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
  },
});

// ─── WRAPPED EXPORT with error boundary ───────────────────────
export default function OnboardingScreen() {
  return (
    <OnboardingErrorBoundary>
      <OnboardingScreenInner />
    </OnboardingErrorBoundary>
  );
}
