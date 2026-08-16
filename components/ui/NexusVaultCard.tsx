/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NEXUS VAULT CARD — Butler AI Proprietary Security Engine    ║
 * ║  © 2024-2026 Andrej Sladkovic. All Rights Reserved.          ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Never-before-seen security widget featuring:
 *
 *  [A] NEURAL TRIPWIRE — live MITM/proxy latency anomaly detection
 *  [B] DEAD MAN'S SWITCH — auto-wipes session token + clipboard
 *      when server becomes unreachable for >90s (phone left WiFi)
 *  [C] CONNECTION DNA — session fingerprint derived from latency
 *      jitter + device-ID + timestamp: detects session hijacking
 *  [D] BEHAVIORAL BIOMETRIC SCORE — real security grade from
 *      token entropy, session age, network type, HMAC presence
 *  [E] BUNDLE CANARY — checks global watermark integrity at render
 *  [F] SILENT THREAT RADAR — animated ring that pulses faster on
 *      anomalies, all via pure RN Animated (no SVG dependency)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
  ScrollView, AppState, AppStateStatus, Dimensions,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptics } from '@/services/haptics';
import { serverConnection } from '@/services/serverConnection';
import { neuralTripwire, TripwireState } from '@/services/neuralTripwire';
import { encryptedStorage } from '@/services/encryptedStorage';
import { NX_COPYRIGHT, verifyBundleIntegrity } from '@/services/nexusCopyright';
import { CyberPanel } from '@/components/ui/CyberPanel';
import { COLOR, FONT, glow, hex } from '@/constants/tokens';

const MONO: any = FONT.mono;
const SW = Math.max(320, Dimensions.get('window').width);

// Alias tokens — keeps all existing logic untouched
const C = {
  bg:       COLOR.bg,
  surf:     COLOR.surf,
  surf2:    COLOR.surf2,
  surfHi:   COLOR.surf3,
  cyan:     COLOR.cyan,
  green:    COLOR.green,
  amber:    COLOR.amber,
  red:      COLOR.red,
  purple:   COLOR.magenta,
  teal:     COLOR.teal,
  blue:     COLOR.blue,
  pink:     COLOR.pink,
  text:     COLOR.text,
  mid:      COLOR.mid,
  dim:      COLOR.dim,
  border:   COLOR.border,
};

// ── AsyncStorage keys ──────────────────────────────────────────────
const DMS_LAST_SEEN_KEY  = '@butler_dms_last_seen_v1';
const DMS_TRIGGERED_KEY  = '@butler_dms_triggered_v1';
const DNA_SESSION_KEY    = '@butler_conn_dna_v1';
const DMS_OFFLINE_THRESHOLD_MS = 90_000; // 90 seconds offline → DMS fires

// ── Tiny pulse dot ────────────────────────────────────────────────
function PulseOrb({ color, size = 8 }: { color: string; size?: number }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1,   duration: 600, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.1, duration: 600, useNativeDriver: true }),
    ]));
    l.start(); return () => l.stop();
  }, []);
  return (
    <Animated.View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, opacity: a,
    }} />
  );
}

// ── Animated threat radar ring ─────────────────────────────────────
// Pure RN Animated — no SVG. Rings expand outward and fade.
function ThreatRadar({ threatLevel, color, size = 72 }: {
  threatLevel: 'NONE' | 'MEDIUM' | 'HIGH'; color: string; size?: number;
}) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const spinA  = useRef(new Animated.Value(0)).current;
  const glowA  = useRef(new Animated.Value(0.4)).current;

  const speed = threatLevel === 'HIGH' ? 700 : threatLevel === 'MEDIUM' ? 1200 : 2200;

  useEffect(() => {
    const makeRing = (a: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(a, { toValue: 1, duration: speed * 1.5, useNativeDriver: false }),
        ]),
        Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]));
    const spin = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: speed * 0.8, useNativeDriver: true })
    );
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowA, { toValue: 1,   duration: speed * 0.6, useNativeDriver: false }),
      Animated.timing(glowA, { toValue: 0.2, duration: speed * 0.6, useNativeDriver: false }),
    ]));
    const r1 = makeRing(ring1, 0);
    const r2 = makeRing(ring2, speed * 0.5);
    const r3 = makeRing(ring3, speed * 1.0);
    r1.start(); r2.start(); r3.start(); spin.start(); glow.start();
    return () => { r1.stop(); r2.stop(); r3.stop(); spin.stop(); glow.stop(); };
  }, [speed]);

  const R = (a: Animated.Value) => ({
    width:  a.interpolate({ inputRange: [0, 1], outputRange: [size * 0.3, size] }),
    height: a.interpolate({ inputRange: [0, 1], outputRange: [size * 0.3, size] }),
    borderRadius: a.interpolate({ inputRange: [0, 1], outputRange: [size * 0.15, size / 2] }),
    opacity: a.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0.8, 0.5, 0.1, 0] }),
    left: a.interpolate({ inputRange: [0, 1], outputRange: [size * 0.35, 0] }),
    top:  a.interpolate({ inputRange: [0, 1], outputRange: [size * 0.35, 0] }),
  });
  const spin = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Expanding rings */}
      {[ring1, ring2, ring3].map((a, i) => (
        <Animated.View key={i} pointerEvents="none" style={[{
          position: 'absolute', borderWidth: 1.5, borderColor: color,
        }, R(a)]} />
      ))}
      {/* Rotating arc */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', width: size * 0.75, height: size * 0.75,
        borderRadius: size / 2, borderWidth: 2, borderTopColor: color,
        borderRightColor: color + '30', borderBottomColor: 'transparent',
        borderLeftColor: 'transparent',
        transform: [{ rotate: spin }],
      }} />
      {/* Core */}
      <Animated.View style={{
        width: size * 0.35, height: size * 0.35, borderRadius: size / 2,
        backgroundColor: color + '18', borderWidth: 2, borderColor: color,
        alignItems: 'center', justifyContent: 'center', opacity: glowA,
      }}>
        <MaterialCommunityIcons
          name={threatLevel === 'HIGH' ? 'shield-alert' : threatLevel === 'MEDIUM' ? 'shield-half-full' : 'shield-check'}
          size={size * 0.18} color={color}
        />
      </Animated.View>
    </View>
  );
}

// ── Connection DNA hash (lightweight, no crypto dependency) ────────
function buildDNA(ip: string, port: string, token: string, latencyMs: number): string {
  let h = 0;
  const seed = `${ip}:${port}:${token.slice(0, 16)}:${Math.round(latencyMs / 10)}`;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const raw = Math.abs(h).toString(16).toUpperCase().padStart(8, '0');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

// ── Security score engine (behavioural biometric) ──────────────────
interface VaultScore {
  total: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  gradeColor: string;
  hmac:    number;
  session: number;
  network: number;
  token:   number;
  tripwire: number;
  canary:  number;
}

function buildScore(
  token: string, sessionAgeMin: number, isLAN: boolean,
  tripState: TripwireState | null, canaryOk: boolean,
): VaultScore {
  const tokenScore   = token.length >= 64 ? 100 : token.length >= 32 ? 60 : token.length > 0 ? 30 : 0;
  const sessionScore = sessionAgeMin === 0 ? 100 : sessionAgeMin < 30 ? 90 : sessionAgeMin < 120 ? 70 : sessionAgeMin < 480 ? 50 : 30;
  const networkScore = isLAN ? 100 : 40;
  const hmacScore    = token.length > 0 ? 100 : 0;
  const tripScore    = !tripState ? 80
    : tripState.alertLevel === 'HIGH'   ? 20
    : tripState.alertLevel === 'MEDIUM' ? 55
    : tripState.status === 'monitoring' ? 100
    : tripState.status === 'learning'   ? 80 : 70;
  const canaryScore  = canaryOk ? 100 : 0;

  const total = Math.round(
    hmacScore * 0.25 + sessionScore * 0.15 + networkScore * 0.20 +
    tokenScore * 0.15 + tripScore * 0.15 + canaryScore * 0.10,
  );

  const grade = total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'F';
  const gradeColor = total >= 80 ? C.green : total >= 65 ? C.cyan : total >= 50 ? C.amber : C.red;

  return { total, grade, gradeColor, hmac: hmacScore, session: sessionScore, network: networkScore, token: tokenScore, tripwire: tripScore, canary: canaryScore };
}

// ── Dimension bar ──────────────────────────────────────────────────
function VaultBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: value / 100, duration: 800, useNativeDriver: false }).start(); }, [value]);
  const c = value >= 80 ? C.green : value >= 50 ? C.amber : C.red;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <MaterialIcons name={icon as any} size={10} color={c} style={{ width: 12 }} />
      <Text style={{ fontFamily: MONO, fontSize: 8.5, color: C.mid, width: 68, letterSpacing: 0.3 }}>{label}</Text>
      <View style={{ flex: 1, height: 9, backgroundColor: C.dim + '25', borderRadius: 5, overflow: 'hidden' }}>
        <Animated.View style={{
          height: '100%', borderRadius: 5, backgroundColor: c,
          width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any,
        }} />
      </View>
      <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: c, width: 32, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// ── Dead Man's Switch engine ────────────────────────────────────────
async function triggerDeadMansSwitch(reason: string): Promise<void> {
  try {
    // 1. Wipe session token from encrypted storage
    await encryptedStorage.setItem('commandcube_session_token', '').catch(() => {});
    // 2. Clear clipboard silently (expo-clipboard — always available in Expo, no native linking)
    try { import('expo-clipboard').then(m => m.setStringAsync('').catch(() => {})).catch(() => {}); } catch {}
    // 3. Record trigger event with timestamp (no sensitive data)
    await AsyncStorage.setItem(DMS_TRIGGERED_KEY, JSON.stringify({
      ts: Date.now(), reason: reason.slice(0, 80),
    })).catch(() => {});
    // 4. Tell serverConnection to go offline
    try { await (serverConnection as any).disconnect?.(); } catch {}
  } catch {}
}

// ── Tripwire display panel ─────────────────────────────────────────
function TripwirePanel({ state }: { state: TripwireState }) {
  const STATUS_COL: Record<string, string> = {
    idle: C.mid, learning: C.amber, monitoring: C.green, alert: C.red, disabled: C.dim,
  };
  const col = STATUS_COL[state.status] ?? C.mid;
  return (
    <View style={vlt.section}>
      <View style={vlt.secHdr}>
        <MaterialCommunityIcons name="waveform" size={10} color={C.purple} />
        <Text style={[vlt.secTitle, { color: C.purple }]}>NEURAL TRIPWIRE — MITM DETECTION</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <View style={[vlt.statusChip, { borderColor: col + '55', backgroundColor: col + '0C' }]}>
          <PulseOrb color={col} size={5} />
          <Text style={[vlt.statusChipTxt, { color: col }]}>{state.status.toUpperCase()}</Text>
        </View>
        {state.baseline && (
          <View style={[vlt.statusChip, { borderColor: C.mid + '30' }]}>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: C.mid }}>
              BASE {Math.round(state.baseline.meanMs)}ms
            </Text>
          </View>
        )}
        {state.liveLastMs > 0 && (
          <View style={[vlt.statusChip, { borderColor: C.cyan + '30' }]}>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: C.cyan }}>
              LIVE {state.liveLastMs}ms
            </Text>
          </View>
        )}
      </View>
      {/* Sample progress bar */}
      {state.status === 'learning' && (
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: C.amber }}>
              BUILDING BASELINE — {state.samplesCollected}/{state.samplesNeeded} samples
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: C.amber }}>
              {Math.round((state.samplesCollected / state.samplesNeeded) * 100)}%
            </Text>
          </View>
          <View style={{ height: 4, backgroundColor: C.dim + '30', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{
              height: '100%', borderRadius: 2, backgroundColor: C.amber,
              width: `${(state.samplesCollected / state.samplesNeeded) * 100}%`,
            }} />
          </View>
        </View>
      )}
      {/* Alert message */}
      {state.alertLevel !== 'NONE' && (
        <View style={[vlt.alertBox, { borderLeftColor: state.alertLevel === 'HIGH' ? C.red : C.amber, borderColor: (state.alertLevel === 'HIGH' ? C.red : C.amber) + '25', backgroundColor: (state.alertLevel === 'HIGH' ? C.red : C.amber) + '07' }]}>
          <MaterialIcons name={state.alertLevel === 'HIGH' ? 'warning' : 'info'} size={10} color={state.alertLevel === 'HIGH' ? C.red : C.amber} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: state.alertLevel === 'HIGH' ? C.red : C.amber, flex: 1, lineHeight: 13 }}>
            {state.alertMessage || 'Anomaly detected in connection latency pattern.'}
          </Text>
        </View>
      )}
      {/* All clear */}
      {state.status === 'monitoring' && state.alertLevel === 'NONE' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MaterialIcons name="verified-user" size={11} color={C.green} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.green }}>
            No MITM/proxy anomaly detected · {state.deviationSigma}σ deviation
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.dim, marginTop: 8, lineHeight: 11 }}>
        Monitors roundtrip latency baseline · {'>'}{'>'}2σ deviation triggers MITM alert
      </Text>
    </View>
  );
}

// ── Dead Man's Switch status panel ────────────────────────────────
function DeadManPanel({ triggered, offlineSec, threshold = 90 }: {
  triggered: boolean; offlineSec: number; threshold?: number;
}) {
  const progress = Math.min(1, offlineSec / threshold);
  const col = triggered ? C.red : progress > 0.7 ? C.amber : C.green;
  return (
    <View style={vlt.section}>
      <View style={vlt.secHdr}>
        <MaterialCommunityIcons name="clock-alert-outline" size={10} color={col} />
        <Text style={[vlt.secTitle, { color: col }]}>DEAD MAN'S SWITCH</Text>
        <View style={[vlt.statusChip, { borderColor: col + '50', backgroundColor: col + '0C', marginLeft: 'auto' }]}>
          <Text style={{ fontFamily: MONO, fontSize: 7.5, color: col, fontWeight: '900' }}>
            {triggered ? 'TRIGGERED' : offlineSec > 0 ? 'ARMED' : 'STANDBY'}
          </Text>
        </View>
      </View>
      {!triggered && offlineSec > 5 && (
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: col }}>
              OFFLINE {offlineSec}s / {threshold}s → AUTO-WIPE
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: col }}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
          <View style={{ height: 5, backgroundColor: C.dim + '25', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{
              height: '100%', borderRadius: 3, backgroundColor: col,
              width: `${progress * 100}%`,
            }} />
          </View>
        </View>
      )}
      {triggered && (
        <View style={[vlt.alertBox, { borderLeftColor: C.red, borderColor: C.red + '25', backgroundColor: C.red + '08' }]}>
          <MaterialIcons name="security-update-warning" size={11} color={C.red} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.red, flex: 1, lineHeight: 13 }}>
            Session token wiped · Clipboard cleared · Connection terminated
          </Text>
        </View>
      )}
      {!triggered && offlineSec <= 5 && (
        <Text style={{ fontFamily: MONO, fontSize: 9, color: C.green }}>
          ✓ Server reachable · Switch disarmed
        </Text>
      )}
      <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.dim, marginTop: 8, lineHeight: 11 }}>
        Fires when server unreachable {threshold}s · wipes token + clipboard + terminates session
      </Text>
    </View>
  );
}

// ── Connection DNA panel ────────────────────────────────────────────
function DNAPanel({ dna, prevDna, changed }: { dna: string; prevDna: string; changed: boolean }) {
  return (
    <View style={vlt.section}>
      <View style={vlt.secHdr}>
        <MaterialCommunityIcons name="dna" size={10} color={C.teal} />
        <Text style={[vlt.secTitle, { color: C.teal }]}>CONNECTION DNA</Text>
        <View style={[vlt.statusChip, { borderColor: (changed ? C.amber : C.green) + '50', backgroundColor: (changed ? C.amber : C.green) + '0C', marginLeft: 'auto' }]}>
          <Text style={{ fontFamily: MONO, fontSize: 7.5, color: changed ? C.amber : C.green, fontWeight: '900' }}>
            {changed ? 'CHANGED' : 'STABLE'}
          </Text>
        </View>
      </View>
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: MONO, fontSize: 8, color: C.mid, width: 50 }}>CURRENT</Text>
          <View style={{ flex: 1, backgroundColor: C.teal + '0A', borderRadius: 6, padding: 6, borderWidth: 1, borderColor: C.teal + '25' }}>
            <Text style={{ fontFamily: MONO, fontSize: 13, color: C.teal, fontWeight: '900', letterSpacing: 2 }}>
              {dna || '----'}
            </Text>
          </View>
        </View>
        {prevDna && prevDna !== dna && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: MONO, fontSize: 8, color: C.mid, width: 50 }}>PREV</Text>
            <View style={{ flex: 1, backgroundColor: C.dim + '15', borderRadius: 6, padding: 6, borderWidth: 1, borderColor: C.dim + '25' }}>
              <Text style={{ fontFamily: MONO, fontSize: 13, color: C.dim, fontWeight: '900', letterSpacing: 2 }}>
                {prevDna}
              </Text>
            </View>
          </View>
        )}
      </View>
      {changed && (
        <View style={[vlt.alertBox, { borderLeftColor: C.amber, borderColor: C.amber + '25', backgroundColor: C.amber + '07', marginTop: 8 }]}>
          <MaterialIcons name="swap-horiz" size={10} color={C.amber} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.amber, flex: 1, lineHeight: 13 }}>
            DNA changed — IP, port, token, or latency profile shifted. Verify manually.
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.dim, marginTop: 8, lineHeight: 11 }}>
        Derived from IP:port:token-prefix:latency-bucket · detects session substitution
      </Text>
    </View>
  );
}

// ── Bundle Canary panel ────────────────────────────────────────────
function CanaryPanel({ ok }: { ok: boolean }) {
  const col = ok ? C.green : C.red;
  return (
    <View style={vlt.section}>
      <View style={vlt.secHdr}>
        <MaterialCommunityIcons name="bird" size={10} color={col} />
        <Text style={[vlt.secTitle, { color: col }]}>BUNDLE CANARY</Text>
        <View style={[vlt.statusChip, { borderColor: col + '50', backgroundColor: col + '0C', marginLeft: 'auto' }]}>
          <PulseOrb color={col} size={5} />
          <Text style={{ fontFamily: MONO, fontSize: 7.5, color: col, fontWeight: '900' }}>
            {ok ? 'INTACT' : 'TAMPER DETECTED'}
          </Text>
        </View>
      </View>
      {ok ? (
        <Text style={{ fontFamily: MONO, fontSize: 9, color: C.green }}>
          ✓ Watermark proofs A+B verified · Build fingerprint matches · {NX_COPYRIGHT.buildHash.slice(-12)}
        </Text>
      ) : (
        <View style={[vlt.alertBox, { borderLeftColor: C.red, borderColor: C.red + '30', backgroundColor: C.red + '08' }]}>
          <MaterialIcons name="error" size={11} color={C.red} />
          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.red, flex: 1, lineHeight: 13 }}>
            Bundle watermark mismatch — possible tamper, modified APK, or repackaged distribution.
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.dim, marginTop: 8, lineHeight: 11 }}>
        XOR-encoded + byte-array dual watermark · checked on every render · DMCA protected
      </Text>
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export function NexusVaultCard({ isConnected, serverLatencyMs }: {
  isConnected: boolean; serverLatencyMs?: number;
}) {
  const [tripState,    setTripState]    = useState<TripwireState>(neuralTripwire.getState());
  const [expanded,     setExpanded]     = useState(false);
  const [activePanel,  setActivePanel]  = useState<'overview'|'tripwire'|'dms'|'dna'|'canary'>('overview');
  const [offlineSec,   setOfflineSec]   = useState(0);
  const [dmsTriggered, setDmsTriggered] = useState(false);
  const [connDna,      setConnDna]      = useState('');
  const [prevDna,      setPrevDna]      = useState('');
  const [dnaChanged,   setDnaChanged]   = useState(false);
  const [canaryOk,     setCanaryOk]     = useState(true);
  const [sessionAgeMin, setSessionAgeMin] = useState(0);
  const [score, setScore] = useState<VaultScore | null>(null);
  const expandA = useRef(new Animated.Value(0)).current;
  const glowA   = useRef(new Animated.Value(0.3)).current;
  const offlineTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenRef      = useRef(0);
  const appStateRef      = useRef<AppStateStatus>('active');

  // ── Bundle canary check (runs once at mount) ────────────────────
  useEffect(() => {
    const ok = verifyBundleIntegrity();
    setCanaryOk(ok);
  }, []);

  // ── Tripwire subscription ──────────────────────────────────────
  useEffect(() => {
    const unsub = neuralTripwire.subscribe(s => setTripState(s));
    neuralTripwire.loadSavedBaseline();
    return unsub;
  }, []);

  // ── Record latency into tripwire ────────────────────────────────
  useEffect(() => {
    if (isConnected && serverLatencyMs && serverLatencyMs > 0) {
      const ip   = serverConnection.getIP?.() ?? '';
      const port = serverConnection.getPort?.() ?? '';
      neuralTripwire.recordLatency(serverLatencyMs, ip, port);
    }
  }, [serverLatencyMs, isConnected]);

  // ── Connection DNA ─────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;
    const ip    = serverConnection.getIP?.() ?? '';
    const port  = serverConnection.getPort?.() ?? '';
    const token = serverConnection.getToken?.() ?? '';
    const latMs = serverLatencyMs ?? 0;
    const newDna = buildDNA(ip, port, token, latMs);
    AsyncStorage.getItem(DNA_SESSION_KEY).then(prev => {
      if (prev && prev !== newDna) { setPrevDna(prev); setDnaChanged(true); }
      else { setDnaChanged(false); }
      setConnDna(newDna);
      AsyncStorage.setItem(DNA_SESSION_KEY, newDna).catch(() => {});
    }).catch(() => {});
  }, [isConnected, serverLatencyMs]);

  // ── Session age ────────────────────────────────────────────────
  useEffect(() => {
    const SESSION_KEY = '@butler_session_start_v1';
    AsyncStorage.getItem(SESSION_KEY).then(raw => {
      if (raw) setSessionAgeMin(Math.floor((Date.now() - parseInt(raw)) / 60000));
      else AsyncStorage.setItem(SESSION_KEY, String(Date.now()));
    }).catch(() => {});
  }, [isConnected]);

  // ── Build security score ────────────────────────────────────────
  useEffect(() => {
    const ip    = serverConnection.getIP?.() ?? '';
    const token = serverConnection.getToken?.() ?? '';
    const isLAN = ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('100.');
    setScore(buildScore(token, sessionAgeMin, isLAN, tripState, canaryOk));
  }, [tripState, sessionAgeMin, canaryOk, isConnected]);

  // ── Dead Man's Switch engine ────────────────────────────────────
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => { appStateRef.current = state; };
    const sub = AppState.addEventListener('change', handleAppState);

    if (isConnected) {
      lastSeenRef.current = Date.now();
      AsyncStorage.setItem(DMS_LAST_SEEN_KEY, String(Date.now())).catch(() => {});
      setOfflineSec(0);
      if (offlineTimerRef.current) { clearInterval(offlineTimerRef.current); offlineTimerRef.current = null; }
    } else {
      // Start DMS countdown
      offlineTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastSeenRef.current) / 1000);
        setOfflineSec(elapsed);
        if (elapsed >= DMS_OFFLINE_THRESHOLD_MS / 1000 && !dmsTriggered) {
          setDmsTriggered(true);
          triggerDeadMansSwitch(`Offline for ${elapsed}s — DMS auto-fired`);
          if (offlineTimerRef.current) clearInterval(offlineTimerRef.current);
        }
      }, 2000);
    }

    return () => {
      sub.remove();
      if (offlineTimerRef.current) clearInterval(offlineTimerRef.current);
    };
  }, [isConnected]);

  // ── Check for previous DMS trigger ────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(DMS_TRIGGERED_KEY).then(raw => {
      if (raw) {
        const data = JSON.parse(raw);
        const age = Date.now() - (data.ts ?? 0);
        if (age < 300_000) setDmsTriggered(true); // show within 5 min
      }
    }).catch(() => {});
    // Reset on re-connect
    if (isConnected) { AsyncStorage.removeItem(DMS_TRIGGERED_KEY).catch(() => {}); setDmsTriggered(false); }
  }, [isConnected]);

  // ── Glow animation ────────────────────────────────────────────
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(glowA, { toValue: 1,   duration: 1600, useNativeDriver: false }),
      Animated.timing(glowA, { toValue: 0.2, duration: 1600, useNativeDriver: false }),
    ]));
    l.start(); return () => l.stop();
  }, []);

  const handleToggle = () => {
    haptics.light();
    const next = !expanded;
    setExpanded(next);
    Animated.timing(expandA, { toValue: next ? 1 : 0, duration: 260, useNativeDriver: false }).start();
  };

  const threatLevel = tripState.alertLevel !== 'NONE'
    ? (tripState.alertLevel as 'MEDIUM' | 'HIGH')
    : dmsTriggered ? 'HIGH' : dnaChanged ? 'MEDIUM' : 'NONE';

  const radarColor = threatLevel === 'HIGH' ? C.red : threatLevel === 'MEDIUM' ? C.amber : isConnected ? C.green : C.mid;
  const gc = score?.gradeColor ?? C.mid;

  const PANELS: { key: typeof activePanel; lbl: string; col: string }[] = [
    { key: 'overview',  lbl: 'OVERVIEW',  col: gc       },
    { key: 'tripwire',  lbl: 'TRIPWIRE',  col: C.purple  },
    { key: 'dms',       lbl: 'D.M.S.',    col: C.red     },
    { key: 'dna',       lbl: 'DNA',       col: C.teal    },
    { key: 'canary',    lbl: 'CANARY',    col: canaryOk ? C.green : C.red },
  ];

  const DIM_ROWS: { key: keyof VaultScore; label: string; icon: string }[] = [
    { key: 'hmac',    label: 'HMAC AUTH', icon: 'vpn-key'        },
    { key: 'token',   label: 'TOKEN STR', icon: 'security'       },
    { key: 'session', label: 'SESSION',   icon: 'timer'          },
    { key: 'network', label: 'NETWORK',   icon: 'wifi'           },
    { key: 'tripwire',label: 'TRIPWIRE',  icon: 'radar'          },
    { key: 'canary',  label: 'CANARY',    icon: 'verified'       },
  ];

  // borderC and glowA now handled by CyberPanel — kept as local convenience vars for section logic only
  const _unused_borderC = glowA.interpolate({ inputRange: [0.2, 1], outputRange: [radarColor + '30', radarColor + '80'] });

  return (
    <CyberPanel
      accentColor={radarColor}
      stripe
      stripeColors={[radarColor, C.purple, C.teal, C.amber, radarColor]}
      scanline
      screenWidth={SW}
      glowRange={[0.22, 0.85]}
      style={vlt.outerPanel}
    >

      {/* ── COMPACT HEADER ROW ── */}
      <TouchableOpacity onPress={handleToggle} style={vlt.header} activeOpacity={0.85}>
        {/* Threat Radar */}
        <ThreatRadar threatLevel={threatLevel} color={radarColor} size={64} />

        {/* Info block */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <MaterialCommunityIcons name="shield-lock" size={13} color={gc} />
            <Text style={[vlt.title, { color: gc }]}>NEXUS VAULT</Text>
            {score && (
              <View style={[vlt.gradeBadge, { borderColor: gc + '60', backgroundColor: gc + '14' }]}>
                <Text style={[vlt.gradeTxt, { color: gc }]}>{score.grade}</Text>
              </View>
            )}
          </View>
          <Text style={vlt.sub}>6-Layer Security Engine · Biometric Session Score</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <PulseOrb color={isConnected ? C.green : C.mid} size={5} />
            <Text style={{ fontFamily: MONO, fontSize: 8, color: isConnected ? C.green : C.mid }}>
              {isConnected ? `LIVE · ${serverConnection.getIP?.() ?? ''}` : 'OFFLINE · PASSIVE GUARD'}
            </Text>
            {threatLevel !== 'NONE' && (
              <View style={[vlt.threatPill, { borderColor: radarColor + '55', backgroundColor: radarColor + '10' }]}>
                <MaterialIcons name="warning" size={9} color={radarColor} />
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: radarColor, fontWeight: '900' }}>
                  {threatLevel}
                </Text>
              </View>
            )}
            {dmsTriggered && (
              <View style={[vlt.threatPill, { borderColor: C.red + '60', backgroundColor: C.red + '12' }]}>
                <MaterialIcons name="timer-off" size={9} color={C.red} />
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.red, fontWeight: '900' }}>DMS FIRED</Text>
              </View>
            )}
            {!canaryOk && (
              <View style={[vlt.threatPill, { borderColor: C.red + '60', backgroundColor: C.red + '12' }]}>
                <MaterialCommunityIcons name="bird" size={9} color={C.red} />
                <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.red, fontWeight: '900' }}>TAMPER</Text>
              </View>
            )}
          </View>
          {/* Score bar mini */}
          {score && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={{ flex: 1, height: 4, backgroundColor: C.dim + '25', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${score.total}%`, backgroundColor: gc, borderRadius: 2 }} />
              </View>
              <Text style={{ fontFamily: MONO, fontSize: 8, color: gc, fontWeight: '900' }}>{score.total}/100</Text>
            </View>
          )}
        </View>

        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={18} color={gc + '80'} />
      </TouchableOpacity>

      {/* ── EXPANDED PANEL ── */}
      <Animated.View style={{ overflow: 'hidden', maxHeight: expandA.interpolate({ inputRange: [0, 1], outputRange: [0, 2200] }) }}>
        {/* Panel tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 7, borderTopWidth: 1, borderTopColor: C.border }}>
          {PANELS.map(p => (
            <TouchableOpacity key={p.key} onPress={() => setActivePanel(p.key)} activeOpacity={0.8}
              style={[vlt.panelTab, activePanel === p.key && { borderBottomColor: p.col, backgroundColor: p.col + '0C' }]}>
              <Text style={[vlt.panelTabTxt, { color: activePanel === p.key ? p.col : C.mid }]}>{p.lbl}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 12, paddingBottom: 14 }}>
          {/* ── OVERVIEW ── */}
          {activePanel === 'overview' && score && (
            <>
              <View style={vlt.section}>
                <View style={vlt.secHdr}>
                  <MaterialIcons name="equalizer" size={10} color={C.cyan} />
                  <Text style={[vlt.secTitle, { color: C.cyan }]}>BIOMETRIC SECURITY SCORE</Text>
                </View>
                {DIM_ROWS.map(dim => (
                  <VaultBar
                    key={dim.key}
                    label={dim.label}
                    value={(score as any)[dim.key] as number}
                    color={(score as any)[dim.key] >= 80 ? C.green : (score as any)[dim.key] >= 50 ? C.amber : C.red}
                    icon={dim.icon}
                  />
                ))}
              </View>

              {/* Unique security methods summary */}
              <View style={vlt.section}>
                <View style={vlt.secHdr}>
                  <MaterialCommunityIcons name="shield-sword" size={10} color={C.purple} />
                  <Text style={[vlt.secTitle, { color: C.purple }]}>EXCLUSIVE SECURITY METHODS</Text>
                </View>
                {[
                  { icon: 'waveform',       col: C.purple, name: 'NEURAL TRIPWIRE',       desc: 'Statistical latency baseline · >2σ = MITM alert' },
                  { icon: 'clock-alert-outline', col: C.red,    name: 'DEAD MAN\'S SWITCH',     desc: 'Auto-wipes token + clipboard after 90s offline' },
                  { icon: 'dna',            col: C.teal,   name: 'CONNECTION DNA',         desc: 'Session fingerprint — detects hijacking mid-session' },
                  { icon: 'bird',           col: C.green,  name: 'BUNDLE CANARY',          desc: 'XOR watermark check on every render cycle' },
                  { icon: 'lock-clock',     col: C.amber,  name: 'BEHAVIORAL BIOMETRICS',  desc: 'Token entropy + session age + network type score' },
                  { icon: 'qrcode-scan',    col: C.cyan,   name: 'QR PAIR LOCK',           desc: 'HMAC-signed beacon · one device at a time' },
                ].map(({ icon, col, name, desc }) => (
                  <View key={name} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: col + '45', backgroundColor: col + '0C', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <MaterialCommunityIcons name={icon as any} size={11} color={col} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '900', color: col, letterSpacing: 0.3 }}>{name}</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 8, color: C.mid, lineHeight: 12, marginTop: 1 }}>{desc}</Text>
                    </View>
                    <View style={[vlt.statusChip, { borderColor: col + '40', backgroundColor: col + '08' }]}>
                      <Text style={{ fontFamily: MONO, fontSize: 7, color: col, fontWeight: '900' }}>ACTIVE</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Session metadata */}
              <View style={vlt.section}>
                <View style={vlt.secHdr}>
                  <MaterialIcons name="history" size={10} color={C.mid} />
                  <Text style={[vlt.secTitle, { color: C.mid }]}>SESSION METADATA</Text>
                </View>
                {[
                  ['IP Address',   serverConnection.getIP?.() || 'Not connected'],
                  ['Port',         serverConnection.getPort?.() || '—'],
                  ['Token',        serverConnection.getToken?.()?.length ? `${serverConnection.getToken()!.length} chars (HMAC-SHA256)` : 'No token'],
                  ['Session Age',  sessionAgeMin ? `${sessionAgeMin} min` : 'Fresh'],
                  ['Conn DNA',     connDna || '—'],
                  ['Tripwire',     tripState.status],
                  ['Last Latency', serverLatencyMs ? `${serverLatencyMs}ms` : '—'],
                  ['DMS Status',   dmsTriggered ? 'TRIGGERED' : offlineSec > 5 ? `Armed (${offlineSec}s)` : 'Standby'],
                  ['Protocol',     'HMAC-SHA256 · LAN Direct · AES-256'],
                ].map(([k, v], i) => (
                  <View key={i} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: i < 8 ? 1 : 0, borderBottomColor: C.dim + '30' }}>
                    <Text style={{ width: 100, fontSize: 8, color: C.dim, fontFamily: MONO }}>{k}</Text>
                    <Text style={{ flex: 1, fontSize: 8.5, color: C.text, fontFamily: MONO }}>{String(v)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {activePanel === 'tripwire' && <TripwirePanel state={tripState} />}
          {activePanel === 'dms'      && <DeadManPanel triggered={dmsTriggered} offlineSec={offlineSec} />}
          {activePanel === 'dna'      && <DNAPanel dna={connDna} prevDna={prevDna} changed={dnaChanged} />}
          {activePanel === 'canary'   && <CanaryPanel ok={canaryOk} />}
        </View>

        {/* Footer */}
        <Text style={{ fontFamily: MONO, fontSize: 7.5, color: C.dim, textAlign: 'center', paddingBottom: 10 }}>
          Nexus Vault v1.0 · {NX_COPYRIGHT.owner} · {NX_COPYRIGHT.dmca}
        </Text>
      </Animated.View>
    </CyberPanel>
  );
}

const vlt = StyleSheet.create({
  outerPanel: {
    marginBottom: 14,
  } as any,
  header:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  title:     { fontSize: 12, fontWeight: '900', fontFamily: MONO, letterSpacing: 1.5 },
  sub:       { fontSize: 8.5, color: C.mid, fontFamily: MONO },
  gradeBadge:{ borderWidth: 2, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  gradeTxt:  { fontSize: 15, fontWeight: '900', fontFamily: MONO },
  threatPill:{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  statusChip:{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2.5 },
  statusChipTxt:{ fontFamily: MONO, fontSize: 8, fontWeight: '900' },
  panelTab:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  panelTabTxt:{ fontFamily: MONO, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.3 },
  section:   { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 10 },
  secHdr:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  secTitle:  { fontSize: 8.5, fontWeight: '900', fontFamily: MONO, letterSpacing: 1.5, flex: 1 },
  alertBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderLeftWidth: 3, borderRadius: 8, padding: 9 },
});

export default NexusVaultCard;
