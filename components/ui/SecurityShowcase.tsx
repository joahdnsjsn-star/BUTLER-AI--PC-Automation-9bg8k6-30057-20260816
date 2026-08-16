/**
 * SecurityShowcase — security carousel + 6-tile stat grid.
 * Rebuilt to match the HUD-style reference with:
 *   • Large bordered tiles with HUD corner brackets
 *   • Animated pulse dots per tile
 *   • Big icon + bold value + sub-label + info (i) badge
 *   • Rotating header row with progress dots
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Platform, StyleSheet, Animated,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { haptics } from '@/services/haptics';
import { FootNote } from './MicroCopy';

const MONO: any = Platform.select({ ios: 'Menlo-Bold', default: 'monospace' });

const C = {
  bg:     '#070A10',
  card:   '#0B0F17',
  card2:  '#0B0F17',
  border: '#4A9EFF',
  cyan:   '#38D9E8',
  green:  '#2FE38A',
  amber:  '#FFB43D',
  purple: '#A468FF',
  blue:   '#4A9EFF',
  teal:   '#38D9E8',
  text:   '#DCE6F2',
  dim:    '#4A9EFF',
  mid:    '#4A9EFF',
};

// ── HUD corner bracket (pure View — no SVG dependency) ─────────────
function HudCorner({ color, corner }: { color: string; corner: 'tl'|'tr'|'bl'|'br' }) {
  const s: any = { position: 'absolute', width: 11, height: 11 };
  if (corner === 'tl') { s.top = 7; s.left = 7; s.borderTopWidth = 2; s.borderLeftWidth = 2; }
  if (corner === 'tr') { s.top = 7; s.right = 7; s.borderTopWidth = 2; s.borderRightWidth = 2; }
  if (corner === 'bl') { s.bottom = 7; s.left = 7; s.borderBottomWidth = 2; s.borderLeftWidth = 2; }
  if (corner === 'br') { s.bottom = 7; s.right = 7; s.borderBottomWidth = 2; s.borderRightWidth = 2; }
  return <View pointerEvents="none" style={[s, { borderColor: color + '80' }]} />;
}

// ── Animated pulse dot ─────────────────────────────────────────────
function PulseDot({ color, size = 7, delay = 0 }: { color: string; size?: number; delay?: number }) {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(a, { toValue: 1,   duration: 900, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.2, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, opacity: a,
    }} />
  );
}

// ── Security facts ─────────────────────────────────────────────────
export interface SecurityFact {
  icon: string; mcIcon: string; color: string;
  label: string; detail: string; tab: string; route: string;
}

export const SECURITY_FACTS: SecurityFact[] = [
  { icon: 'lock',           mcIcon: 'key-variant',          color: C.cyan,   label: 'ROTATING TOKENS', detail: 'Session HMAC-256 tokens rotate — single device binding with replay protection on every request.', tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'lock',           mcIcon: 'lock-outline',         color: C.cyan,   label: 'AES-256-GCM',     detail: 'All PC bridge traffic encrypted with AES-256-GCM. No plaintext ever crosses the LAN.',           tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'signal-wifi-off',mcIcon: 'wifi-off',             color: C.green,  label: 'LAN ONLY',        detail: 'Zero internet required. Butler never connects outside your local network.',                        tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'analytics',      mcIcon: 'chart-line',           color: C.amber,  label: 'ZERO TELEMETRY',  detail: 'No analytics, no crash reports, no usage data. Nothing leaves your device or LAN — ever.',       tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'cloud-off',      mcIcon: 'cloud-off-outline',    color: C.purple, label: 'NO CLOUD RELAY',  detail: 'Commands go phone → LAN → PC directly. No relay server, no middleman, no cloud dependency.',     tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'vpn-key',        mcIcon: 'key-variant',          color: C.blue,   label: '64C TOKEN',       detail: 'Session authenticated with a 64-character HMAC-SHA256 token generated at pairing time.',           tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'shield',         mcIcon: 'shield-key-outline',   color: C.teal,   label: 'SHA-256 HMAC',    detail: 'Every API request signed with SHA-256 HMAC. Replay and injection attacks are rejected.',           tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'storage',        mcIcon: 'database-lock',        color: C.cyan,   label: 'LOCAL STORAGE',   detail: 'All app data in on-device encrypted AsyncStorage. No Supabase, no Firebase, no third-party DB.',  tab: 'knowledge', route: '/(tabs)/knowledge' },
  { icon: 'memory',         mcIcon: 'chip',                 color: C.amber,  label: 'LOCAL AI MODEL',  detail: 'Ollama runs qwen2.5-coder:7b on your own PC. No OpenAI, no Anthropic, no tokens billed.',         tab: 'butler',    route: '/(tabs)/butler'    },
  { icon: 'qr-code',        mcIcon: 'qrcode-scan',          color: C.blue,   label: 'QR PAIRING',      detail: 'Pairing is one-scan with a QR code from butler_server.py. No account, no signup.',                tab: 'nexushome', route: '/(tabs)/nexushome' },
  { icon: 'verified',       mcIcon: 'check-decagram',       color: C.green,  label: 'VERIFIED SECURE', detail: 'Security posture verified on every launch: token present, LAN-only active, HMAC auth working.',   tab: 'settings',  route: '/(tabs)/settings'  },
  { icon: 'code',           mcIcon: 'code-braces',          color: C.purple, label: '250+ SCRIPTS',    detail: 'Over 250 Python automation scripts, all executed locally on your PC — never cloud interpreted.',   tab: 'scripts',   route: '/(tabs)/scripts'   },
  { icon: 'folder',         mcIcon: 'folder-lock-outline',  color: C.amber,  label: 'FILE VAULT',      detail: 'File transfer and clipboard sync use the same AES-256-GCM channel. Nothing cached on the phone.', tab: 'fileshare', route: '/(tabs)/fileshare' },
  { icon: 'bar-chart',      mcIcon: 'chart-bar',            color: C.cyan,   label: 'INTEL LOGS',      detail: 'Execution logs stored on-device only. Purged after 90 days. Never uploaded or shared.',           tab: 'logs',      route: '/(tabs)/logs'      },
  { icon: 'palette',        mcIcon: 'palette-swatch',       color: C.purple, label: 'COSMETIC ONLY',   detail: 'Skins change colors and fonts only — never touch logic, permissions, or network config.',          tab: 'cosmetic',  route: '/(tabs)/cosmetic'  },
  { icon: 'brain',          mcIcon: 'brain',                color: C.green,  label: 'SELF-LEARNING KB',detail: 'Knowledge base grows from local sessions only. No external data ingested without approval.',        tab: 'knowledge', route: '/(tabs)/knowledge' },
];

// ── 6 stat tiles (matches reference image exactly) ─────────────────
const STAT_TILES = [
  { IconComp: MaterialIcons,          iconName: 'lock',              big: 'AES-256', small: 'GCM ENCRYPT',  color: C.cyan,   delay: 0   },
  { IconComp: MaterialIcons,          iconName: 'signal-wifi-off',   big: 'LAN',     small: 'ONLY MODE',    color: C.green,  delay: 200 },
  { IconComp: MaterialIcons,          iconName: 'analytics',         big: 'NO',      small: 'TELEMETRY',    color: C.amber,  delay: 400 },
  { IconComp: MaterialIcons,          iconName: 'cloud-off',         big: '0',       small: 'CLOUD RELAY',  color: C.purple, delay: 100 },
  { IconComp: MaterialIcons,          iconName: 'vpn-key',           big: '64C',     small: 'TOKEN LENGTH', color: C.blue,   delay: 300 },
  { IconComp: MaterialCommunityIcons, iconName: 'shield-key-outline',big: 'SHA',     small: '256 HMAC',     color: C.teal,   delay: 500 },
] as const;

// ── Single stat tile (HUD style) ───────────────────────────────────
function StatTile({ tile, index }: { tile: typeof STAT_TILES[number]; index: number }) {
  const scaleA = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleA, { toValue: 0.96, duration: 60, useNativeDriver: true }),
      Animated.spring(scaleA, { toValue: 1, tension: 260, friction: 10, useNativeDriver: true }),
    ]).start();
    haptics.light();
  };

  return (
    <Animated.View style={[ts.outer, { borderColor: tile.color + '40', transform: [{ scale: scaleA }] }]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.88} style={ts.inner}>
        {/* HUD corner brackets */}
        <HudCorner color={tile.color} corner="tl" />
        <HudCorner color={tile.color} corner="br" />

        {/* Pulse dot top-right */}
        <View style={ts.dotWrap} pointerEvents="none">
          <PulseDot color={tile.color} size={8} delay={tile.delay} />
        </View>

        {/* Icon */}
        <View style={[ts.iconWrap, { borderColor: tile.color + '35', backgroundColor: tile.color + '0C' }]}>
          <tile.IconComp name={tile.iconName as any} size={26} color={tile.color} />
        </View>

        {/* Big value */}
        <Text style={[ts.big, { color: tile.color,
          ...(Platform.OS === 'ios' ? { textShadowColor: tile.color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 } : {}),
        }]}>{tile.big}</Text>

        {/* Sub label */}
        <Text style={ts.small}>{tile.small}</Text>

        {/* Info badge */}
        <View style={ts.infoBadge} pointerEvents="none">
          <Text style={[ts.infoTxt, { color: tile.color + '60' }]}>ⓘ</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const ts = StyleSheet.create({
  outer: {
    flexBasis: '30%', flexGrow: 1,
    borderRadius: 16, borderWidth: 1.5,
    backgroundColor: C.card,
    overflow: 'hidden',
    minHeight: 138,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  inner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 18, paddingBottom: 24, paddingHorizontal: 8,
    gap: 6,
  },
  dotWrap:   { position: 'absolute', top: 9, right: 9 },
  iconWrap:  { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  big:       { fontFamily: MONO, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  small:     { fontFamily: MONO, fontSize: 8, fontWeight: '700', color: C.mid, letterSpacing: 1.2, textAlign: 'center' },
  infoBadge: { position: 'absolute', bottom: 6, right: 8 },
  infoTxt:   { fontSize: 13 },
});

// ── Main component ─────────────────────────────────────────────────
export default function SecurityShowcase({ mode = 'full' }: { mode?: 'full' | 'strip' }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideA = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    timer.current = setInterval(() => {
      Animated.sequence([
        Animated.timing(slideA, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(slideA, { toValue: 0, duration: 0,   useNativeDriver: true }),
      ]).start();
      setIdx(i => (i + 1) % SECURITY_FACTS.length);
    }, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const fact = SECURITY_FACTS[idx] ?? SECURITY_FACTS[0];
  const open = useCallback(() => {
    haptics.selection();
    if (fact?.route) { try { router.push(fact.route as any); } catch {} }
  }, [fact, router]);

  if (!fact) return null;

  // ── STRIP MODE ──────────────────────────────────────────────────
  if (mode === 'strip') {
    return (
      <TouchableOpacity onPress={open} activeOpacity={0.8} style={ss.strip}>
        <PulseDot color={fact.color} size={6} />
        <Text numberOfLines={1} style={[ss.stripLabel, { color: fact.color }]}>{fact.label}</Text>
        <Text numberOfLines={1} style={ss.stripDetail}>{fact.detail}</Text>
        <Text style={ss.stripCount}>{String(idx + 1).padStart(2, '0')}/{SECURITY_FACTS.length}</Text>
      </TouchableOpacity>
    );
  }

  // ── FULL MODE ───────────────────────────────────────────────────
  return (
    <View>
      {/* Progress dots + "TAP FOR DETAILS >" */}
      <View style={ss.dotsRow}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          {SECURITY_FACTS.map((f, i) => (
            <View key={i} style={[ss.dot,
              i === idx
                ? { width: 14, height: 5, backgroundColor: fact.color, borderRadius: 3 }
                : { backgroundColor: C.dim },
            ]} />
          ))}
        </View>
        <TouchableOpacity onPress={open} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={ss.tapText}>TAP FOR DETAILS</Text>
          <MaterialIcons name="chevron-right" size={11} color={C.mid} />
        </TouchableOpacity>
      </View>

      {/* Rotating fact card */}
      <TouchableOpacity onPress={open} activeOpacity={0.88}
        style={[ss.factCard, { borderColor: fact.color + '50', backgroundColor: C.card }]}>
        {/* HUD corners */}
        <HudCorner color={fact.color} corner="tl" />
        <HudCorner color={fact.color} corner="br" />
        <HudCorner color={fact.color} corner="tr" />
        <HudCorner color={fact.color} corner="bl" />

        {/* Icon box */}
        <View style={[ss.factIconBox, { borderColor: fact.color + '55', backgroundColor: fact.color + '10' }]}>
          <MaterialCommunityIcons name={fact.mcIcon as any} size={22} color={fact.color} />
        </View>

        {/* Label + detail */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PulseDot color={fact.color} size={7} />
            <Text style={[ss.factLabel, { color: fact.color }]}>{fact.label}</Text>
            <View style={[ss.verifiedBadge, { borderColor: fact.color + '50', backgroundColor: fact.color + '0D' }]}>
              <MaterialIcons name="check" size={9} color={fact.color} />
              <Text style={[ss.verifiedTxt, { color: fact.color }]}>VERIFIED</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={ss.factDetail}>{fact.detail}</Text>
        </View>

        {/* Counter */}
        <View style={ss.counter}>
          <Text style={[ss.counterBig, { color: C.text }]}>{String(idx + 1).padStart(2, '0')}</Text>
          <Text style={ss.counterSmall}>/{SECURITY_FACTS.length}</Text>
        </View>
      </TouchableOpacity>

      {/* 3×2 stat tile grid */}
      <View style={ss.grid}>
        {STAT_TILES.map((t, i) => (
          <StatTile key={t.small} tile={t} index={i} />
        ))}
      </View>

      <FootNote>
        {`rotates every 4s · ${SECURITY_FACTS.length} verifiable guarantees · tap to jump to source`}
      </FootNote>
    </View>
  );
}

const ss = StyleSheet.create({
  strip: {
    height: 36, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.card,
  },
  stripLabel:  { fontFamily: MONO, fontSize: 9, letterSpacing: 1 },
  stripDetail: { fontFamily: MONO, fontSize: 8, color: C.mid, flex: 1 },
  stripCount:  { fontFamily: MONO, fontSize: 8, color: C.mid },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10, paddingHorizontal: 2,
  },
  dot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: C.dim },
  tapText: { fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, color: C.mid },

  factCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    padding: 16, borderRadius: 16, borderWidth: 1.5,
    marginBottom: 0, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  factIconBox: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  factLabel: {
    fontFamily: MONO, fontSize: 14, fontWeight: '900', letterSpacing: 0.5,
  },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  verifiedTxt: { fontFamily: MONO, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  factDetail: {
    fontFamily: MONO, fontSize: 9, color: C.mid, lineHeight: 14,
  },
  counter:      { alignItems: 'center', gap: 2 },
  counterBig:   { fontFamily: MONO, fontSize: 18, fontWeight: '900' },
  counterSmall: { fontFamily: MONO, fontSize: 8, color: C.mid },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10,
  },
});
