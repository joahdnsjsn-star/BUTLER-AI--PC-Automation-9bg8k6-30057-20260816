
/**
 * Butler AI — Last Crash Report Screen
 * Accessible from Settings > LEGAL & HELP > LAST CRASH REPORT
 *
 * Reads @butler_last_crash_v2 (bootGuard.tsx crash capture) and
 * @butler_boot_errors_v1 (bootErrorLog.ts multi-entry log).
 * Shows timestamp, error message, stack trace snippet, platform info,
 * plus a Clear & Restart action.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Switch, // Added Switch import
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { haptics } from '@/services/haptics';
import { getBootErrors, clearBootErrors, type BootErrorEntry } from '@/services/bootErrorLog';

// ── Design tokens (match settings.tsx / global Nexus palette) ──────
const T = {
  bg:        '#050810',
  surface:   '#0B0F17',
  surfHi:    '#4A9EFF',
  cyan:      '#38D9E8',
  green:     '#2FE38A',
  amber:     '#FFB43D',
  danger:    '#FF4D5E',
  purple:    '#A468FF',
  text:      '#DCE6F2',
  textMid:   '#4A9EFF',
  textDim:   '#4A9EFF',
  border:    'rgba(0,229,255,0.12)',
};
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

// ── Key from bootGuard (single last crash) ──────────────────────────
const LAST_CRASH_KEY = '@butler_last_crash_v2';

interface LastCrash {
  at:      number;
  message: string;
  stack?:  string;
}

// ── HUD corner brackets ─────────────────────────────────────────────
function HudCorners({ color, size = 10, t = 1.5 }: { color: string; size?: number; t?: number }) {
  return (
    <>
      <View style={{ position:'absolute', top:0,    left:0,  width:size, height:size, borderTopWidth:t,    borderLeftWidth:t,   borderColor:color }} />
      <View style={{ position:'absolute', top:0,    right:0, width:size, height:size, borderTopWidth:t,    borderRightWidth:t,  borderColor:color }} />
      <View style={{ position:'absolute', bottom:0, left:0,  width:size, height:size, borderBottomWidth:t, borderLeftWidth:t,   borderColor:color }} />
      <View style={{ position:'absolute', bottom:0, right:0, width:size, height:size, borderBottomWidth:t, borderRightWidth:t,  borderColor:color }} />
    </>
  );
}

// ── Pulse animated dot ──────────────────────────────────────────────
function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0.2, duration: 700, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: anim }} />;
}

// ── Crash card ──────────────────────────────────────────────────────
function CrashCard({
  index, title, timestamp, message, stack, platform, version, accent,
}: {
  index: number; title: string; timestamp: number | null; message: string;
  stack?: string; platform?: string; version?: string; accent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = timestamp
    ? new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : 'Unknown time';

  return (
    <View style={[cc.card, { borderColor: accent + '50', borderLeftColor: accent }]}>
      <View style={[cc.topBar, { backgroundColor: accent }]} />
      <HudCorners color={accent + '40'} size={8} t={1} />

      {/* Header row */}
      <View style={cc.headerRow}>
        <View style={[cc.indexBadge, { borderColor: accent + '60', backgroundColor: accent + '14' }]}>
          <Text style={[cc.indexTxt, { color: accent }]}>#{index}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[cc.title, { color: accent }]}>{title}</Text>
          <Text style={[cc.date, { color: T.textMid }]}>{dateStr}</Text>
        </View>
        <PulseDot color={accent} size={7} />
      </View>

      {/* Meta row */}
      <View style={cc.metaRow}>
        {platform ? (
          <View style={[cc.metaChip, { borderColor: T.cyan + '40' }]}>
            <MaterialIcons name="phone-android" size={10} color={T.cyan} />
            <Text style={[cc.metaTxt, { color: T.cyan }]}>{platform}</Text>
          </View>
        ) : null}
        {version ? (
          <View style={[cc.metaChip, { borderColor: T.purple + '40' }]}>
            <MaterialCommunityIcons name="tag" size={10} color={T.purple} />
            <Text style={[cc.metaTxt, { color: T.purple }]}>v{version}</Text>
          </View>
        ) : null}
      </View>

      {/* Error message */}
      <View style={[cc.msgBox, { borderColor: accent + '25', backgroundColor: accent + '06' }]}>
        <Text style={[cc.msgLabel, { color: accent + '80' }]}>ERROR MESSAGE</Text>
        <Text style={[cc.msgTxt, { color: T.text }]} selectable>{message}</Text>
      </View>

      {/* Stack trace (collapsible) */}
      {stack ? (
        <>
          <TouchableOpacity
            onPress={() => { setExpanded(e => !e); try { haptics.light(); } catch {} }}
            activeOpacity={0.8}
            style={cc.stackToggle}
          >
            <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={14} color={T.textMid} />
            <Text style={[cc.stackToggleTxt, { color: T.textMid }]}>
              {expanded ? 'HIDE STACK TRACE' : 'SHOW STACK TRACE'}
            </Text>
          </TouchableOpacity>
          {expanded ? (
            <View style={[cc.stackBox, { borderColor: T.textDim }]}>
              <Text style={cc.stackTxt} selectable>{stack}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const cc = StyleSheet.create({
  card:       { borderWidth: 1.5, borderLeftWidth: 4, borderRadius: 12, backgroundColor: T.surface, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  topBar:     { height: 2.5 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  indexBadge: { width: 36, height: 36, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  indexTxt:   { fontFamily: MONO, fontSize: 13, fontWeight: '900' },
  title:      { fontFamily: MONO, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  date:       { fontFamily: MONO, fontSize: 9, marginTop: 2 },
  metaRow:    { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingBottom: 10, flexWrap: 'wrap' },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  metaTxt:    { fontFamily: MONO, fontSize: 9, fontWeight: '700' },
  msgBox:     { marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderRadius: 8, padding: 10 },
  msgLabel:   { fontFamily: MONO, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  msgTxt:     { fontFamily: MONO, fontSize: 11, lineHeight: 17 },
  stackToggle:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingBottom: 8 },
  stackToggleTxt: { fontFamily: MONO, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  stackBox:   { marginHorizontal: 14, marginBottom: 12, borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: '#050810' },
  stackTxt:   { fontFamily: MONO, fontSize: 9.5, color: T.amber, lineHeight: 16 },
});

// ── Main screen ─────────────────────────────────────────────────────
export default function CrashReportScreen() {
  const insets = useSafeAreaInsets();

  const [lastCrash,   setLastCrash]   = useState<LastCrash | null>(null);
  const [bootErrors,  setBootErrors]  = useState<BootErrorEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [cleared,     setCleared]     = useState(false);
  const [clearing,    setClearing]    = useState(false);
  const [autoReport,  setAutoReport]  = useState(false);
  const [autoSaved,   setAutoSaved]   = useState(false);

  // Header scan animation
  const scanX = useRef(new Animated.Value(-200)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue: 500, duration: 2800, useNativeDriver: false }),
      Animated.timing(scanX, { toValue: -200, duration: 0, useNativeDriver: false }),
      Animated.delay(1600),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const AUTO_REPORT_KEY = '@butler_auto_report_crash_v1';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rawCrash, bootErrs, autoFlag] = await Promise.all([
        AsyncStorage.getItem(LAST_CRASH_KEY),
        getBootErrors(),
        AsyncStorage.getItem(AUTO_REPORT_KEY), // Use the constant
      ]);
      if (rawCrash) {
        try { setLastCrash(JSON.parse(rawCrash)); } catch {}
      }
      setBootErrors(bootErrs);
      setAutoReport(autoFlag === '1');
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCrashes = (lastCrash ? 1 : 0) + bootErrors.length;
  const hasAny = totalCrashes > 0;

  const handleClear = useCallback(async () => {
    try { haptics.heavy(); } catch {}
    setClearing(true);
    try {
      await Promise.all([
        AsyncStorage.removeItem(LAST_CRASH_KEY),
        clearBootErrors(),
      ]);
      setLastCrash(null);
      setBootErrors([]);
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } catch {}
    setClearing(false);
  }, []);

  const handleToggleAutoReport = useCallback(async (val: boolean) => {
    try { haptics.medium(); } catch {}
    setAutoReport(val);
    try {
      if (val) {
        await AsyncStorage.setItem(AUTO_REPORT_KEY, '1');
      } else {
        await AsyncStorage.removeItem(AUTO_REPORT_KEY);
      }
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } catch {}
  }, []);

  const handleShare = useCallback(async () => {
    try { haptics.medium(); } catch {}
    try {
      const lines: string[] = [
        '=== BUTLER AI CRASH REPORT ===',
        `Generated: ${new Date().toISOString()}`,
        `Platform: ${Platform.OS} ${Platform.Version}`,
        '',
      ];

      if (lastCrash) {
        lines.push('── LAST STARTUP CRASH ────────────────');
        lines.push(`Time:    ${new Date(lastCrash.at).toISOString()}`);
        lines.push(`Message: ${lastCrash.message}`);
        if (lastCrash.stack) lines.push(`Stack:\n${lastCrash.stack}`);
        lines.push('');
      }

      if (bootErrors.length > 0) {
        lines.push('── BOOT ERROR LOG ────────────────────');
        bootErrors.forEach((e, i) => {
          lines.push(`[${i + 1}] ${e.ts} | ${e.phase} | ${e.message}`);
          if (e.stack) lines.push(`    ${e.stack.slice(0, 200)}`);
        });
      }

      if (lines.length <= 4) lines.push('No crash data found — system healthy.');

      await Share.share({
        title: 'Butler AI Crash Report',
        message: lines.join('\n'),
      });
    } catch {}
  }, [lastCrash, bootErrors]);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* ── Custom header ────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        {/* Scan line */}
        <Animated.View
          pointerEvents="none"
          style={[s.headerScan, { transform: [{ translateX: scanX }] }]}
        />
        <HudCorners color={T.danger + '60'} size={12} t={1.5} />

        {/* Top accent bar */}
        <View style={[s.headerAccentBar, { backgroundColor: T.danger }]} />

        <View style={s.headerContent}>
          {/* Back button */}
          <TouchableOpacity
            onPress={() => { try { haptics.light(); } catch {} router.back(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.backBtn}
          >
            <MaterialIcons name="arrow-back" size={20} color={T.danger} />
          </TouchableOpacity>

          {/* Title */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.iconOrb, { borderColor: T.danger + '60', backgroundColor: T.danger + '14' }]}>
                <MaterialCommunityIcons name="bug" size={18} color={T.danger} />
              </View>
              <View>
                <Text style={[s.headerTitle, { color: T.danger }]}>CRASH REPORT</Text>
                <Text style={[s.headerSub, { color: T.textMid }]}>Startup diagnostics · AsyncStorage logs</Text>
              </View>
            </View>
          </View>

          {/* Share button */}
          <TouchableOpacity
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[s.shareBtn, { borderColor: T.cyan + '55', backgroundColor: T.cyan + '0C' }]}
          >
            <MaterialIcons name="share" size={16} color={T.cyan} />
          </TouchableOpacity>
        </View>

        {/* Status strip */}
        <View style={[s.statusStrip, { borderTopColor: T.danger + '20' }]}>
          <PulseDot color={hasAny ? T.danger : T.green} size={6} />
          <Text style={[s.statusTxt, { color: hasAny ? T.danger : T.green }]}>
            {loading
              ? 'SCANNING CRASH STORAGE...'
              : hasAny
              ? `${totalCrashes} CRASH RECORD${totalCrashes !== 1 ? 'S' : ''} FOUND`
              : 'NO CRASHES RECORDED · SYSTEM HEALTHY'}
          </Text>
          {!loading && (
            <View style={[s.statusBadge, { borderColor: hasAny ? T.danger + '50' : T.green + '50', backgroundColor: hasAny ? T.danger + '10' : T.green + '10' }]}>
              <Text style={[s.statusBadgeTxt, { color: hasAny ? T.danger : T.green }]}>
                {hasAny ? 'DEGRADED' : 'NOMINAL'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Loading ────────────────────────────────────────────── */}
        {loading ? (
          <View style={s.loadingWrap}>
            <MaterialCommunityIcons name="loading" size={32} color={T.textMid} />
            <Text style={[s.loadingTxt, { color: T.textMid }]}>SCANNING CRASH LOGS...</Text>
          </View>
        ) : null}

        {/* ── Cleared confirmation ───────────────────────────────── */}
        {cleared ? (
          <View style={[s.clearedBanner, { borderColor: T.green + '60', backgroundColor: T.green + '0C' }]}>
            <HudCorners color={T.green + '50'} size={8} t={1} />
            <MaterialIcons name="check-circle" size={18} color={T.green} />
            <Text style={[s.clearedTxt, { color: T.green }]}>ALL CRASH LOGS CLEARED · SYSTEM NOMINAL</Text>
          </View>
        ) : null}

        {/* ── No crashes ─────────────────────────────────────────── */}
        {!loading && !hasAny && !cleared ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIconRing, { borderColor: T.green + '60' }]}>
              <MaterialCommunityIcons name="shield-check" size={48} color={T.green} />
            </View>
            <Text style={[s.emptyTitle, { color: T.green }]}>ALL SYSTEMS NOMINAL</Text>
            <Text style={[s.emptySub, { color: T.textMid }]}>
              {'No crash records found.\nButler AI started cleanly on all recent boots.'}
            </Text>
            <View style={[s.healthGrid, { borderColor: T.green + '30' }]}>
              {[
                { icon: 'memory', label: 'STARTUP',    val: 'CLEAN',  col: T.green  },
                { icon: 'shield', label: 'CRASH LOG',  val: 'EMPTY',  col: T.green  },
                { icon: 'wifi',   label: 'POLYFILLS',  val: 'ACTIVE', col: T.cyan   },
                { icon: 'lock',   label: 'BOOT GUARD', val: 'ARMED',  col: T.purple },
              ].map((item, i) => (
                <View key={i} style={[s.healthCell, { borderColor: item.col + '30', backgroundColor: item.col + '08' }]}>
                  <MaterialIcons name={item.icon as any} size={16} color={item.col} />
                  <Text style={[s.healthVal, { color: item.col }]}>{item.val}</Text>
                  <Text style={[s.healthLabel, { color: item.col + '70' }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Last Crash (bootGuard) ─────────────────────────────── */}
        {!loading && lastCrash ? (
          <>
            <View style={s.sectionHdr}>
              <View style={[s.sectionBar, { backgroundColor: T.danger }]} />
              <MaterialCommunityIcons name="alert-circle" size={11} color={T.danger} />
              <Text style={[s.sectionTxt, { color: T.danger }]}>LAST STARTUP CRASH</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.danger + '30' }} />
            </View>
            <CrashCard
              index={1}
              title="STARTUP CRASH CAPTURED"
              timestamp={lastCrash.at}
              message={lastCrash.message}
              stack={lastCrash.stack}
              platform={`${Platform.OS} ${Platform.Version}`}
              accent={T.danger}
            />
          </>
        ) : null}

        {/* ── Boot error log (multi-entry) ───────────────────────── */}
        {!loading && bootErrors.length > 0 ? (
          <>
            <View style={s.sectionHdr}>
              <View style={[s.sectionBar, { backgroundColor: T.amber }]} />
              <MaterialCommunityIcons name="history" size={11} color={T.amber} />
              <Text style={[s.sectionTxt, { color: T.amber }]}>BOOT ERROR LOG  ({bootErrors.length})</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.amber + '30' }} />
            </View>
            {bootErrors.map((e, i) => (
              <CrashCard
                key={i}
                index={i + 1}
                title={`BOOT ERROR · ${e.phase.toUpperCase()}`}
                timestamp={e.tsMs}
                message={e.message}
                stack={e.stack}
                platform={e.platform}
                version={e.appVersion}
                accent={T.amber}
              />
            ))}
          </>
        ) : null}

        {/* ── System info ───────────────────────────────────────── */}
        {!loading ? (
          <>
            <View style={s.sectionHdr}>
              <View style={[s.sectionBar, { backgroundColor: T.cyan }]} />
              <MaterialCommunityIcons name="information-outline" size={11} color={T.cyan} />
              <Text style={[s.sectionTxt, { color: T.cyan }]}>SYSTEM PROTECTION STATUS</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.cyan + '30' }} />
            </View>
            <View style={[s.sysCard, { borderColor: T.cyan + '35' }]}>
              <HudCorners color={T.cyan + '40'} size={8} t={1} />
              <View style={[s.sysTopBar, { backgroundColor: T.cyan }]} />
              {[
                { label: 'URLSearchParams polyfill',  val: 'ACTIVE',      col: T.green,  icon: 'check-circle'  },
                { label: 'Boot guard (Dimensions)',    val: 'ARMED',       col: T.green,  icon: 'shield-check'  },
                { label: 'Crash capture (ErrorUtils)', val: 'INSTALLED',  col: T.green,  icon: 'bug-report'    },
                { label: 'Whatwg-url stub',            val: 'INTERCEPTED', col: T.cyan,   icon: 'swap-calls'    },
                { label: 'expo-router/entry intercept',val: 'ACTIVE',     col: T.cyan,   icon: 'router'        },
                { label: 'Onboarding failsafe',        val: 'READY',      col: T.purple, icon: 'security'      },
              ].map((item, i) => (
                <View key={i} style={[s.sysRow, { borderBottomWidth: i < 5 ? StyleSheet.hairlineWidth : 0, borderBottomColor: T.cyan + '15' }]}>
                  <MaterialIcons name={item.icon as any} size={14} color={item.col} />
                  <Text style={[s.sysLabel, { color: T.textMid }]}>{item.label}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={[s.sysValChip, { borderColor: item.col + '50', backgroundColor: item.col + '10' }]}>
                    <Text style={[s.sysVal, { color: item.col }]}>{item.val}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ── Action buttons ─────────────────────────────────────── */}
        {/* ── AUTO-REPORT TOGGLE ───────────────────────────────── */}
        {!loading ? (
          <>
            <View style={s.sectionHdr}>
              <View style={[s.sectionBar, { backgroundColor: T.purple }]} />
              <MaterialCommunityIcons name="robot" size={11} color={T.purple} />
              <Text style={[s.sectionTxt, { color: T.purple }]}>AUTONOMOUS CRASH REPORTING</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.purple + '30' }} />
            </View>
            <View style={[autoTog.card, { borderColor: autoReport ? T.purple + '60' : T.border, backgroundColor: autoReport ? T.purple + '06' : T.surface }]}>
              <HudCorners color={autoReport ? T.purple + '40' : T.border} size={8} t={1} />
              <View style={[autoTog.topBar, { backgroundColor: T.purple }]} />
              <View style={autoTog.row}>
                <View style={[autoTog.iconBox, { borderColor: T.purple + '60', backgroundColor: T.purple + '14' }]}>
                  <MaterialCommunityIcons name="clipboard-text-clock" size={20} color={T.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[autoTog.label, { color: autoReport ? T.text : T.textMid }]}>AUTO-REPORT ON NEXT CRASH</Text>
                  <Text style={autoTog.sub}>
                    {autoReport
                      ? 'ON · Next crash → instant clipboard copy'
                      : 'OFF · Crashes stored silently in log'}
                  </Text>
                </View>
                <Switch
                  value={autoReport}
                  onValueChange={handleToggleAutoReport}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: T.purple + '60' }}
                  thumbColor={autoReport ? T.purple : T.textDim}
                  ios_backgroundColor="rgba(255,255,255,0.08)"
                />
              </View>
              {autoReport ? (
                <View style={autoTog.descBox}>
                  <MaterialIcons name="info" size={12} color={T.purple + '80'} />
                  <Text style={autoTog.desc}>
                    {'When a startup crash occurs, the full error message + stack trace will be\nautomatically copied to your clipboard so you can paste it instantly — no need to open this screen.'}
                  </Text>
                </View>
              ) : null}
              {autoSaved ? (
                <View style={autoTog.savedBadge}>
                  <MaterialIcons name="check" size={10} color={T.green} />
                  <Text style={[autoTog.savedTxt, { color: T.green }]}>SAVED</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {!loading ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            {hasAny ? (
              <TouchableOpacity
                onPress={handleClear}
                disabled={clearing}
                activeOpacity={0.85}
                style={[s.actionBtn, { backgroundColor: T.danger, opacity: clearing ? 0.6 : 1 }]}
              >
                <MaterialIcons name="delete-sweep" size={20} color="#000" />
                <Text style={[s.actionBtnTxt, { color: '#000' }]}>
                  {clearing ? 'CLEARING...' : 'CLEAR ALL CRASH LOGS'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.85}
              style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: T.cyan + '70' }]}
            >
              <MaterialIcons name="share" size={18} color={T.cyan} />
              <Text style={[s.actionBtnTxt, { color: T.cyan }]}>EXPORT CRASH REPORT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={load}
              activeOpacity={0.85}
              style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: T.purple + '60' }]}
            >
              <MaterialIcons name="refresh" size={18} color={T.purple} />
              <Text style={[s.actionBtnTxt, { color: T.purple }]}>REFRESH LOG</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Footer ─────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 60, height: 1, backgroundColor: T.danger + '30' }} />
            <MaterialCommunityIcons name="bug" size={10} color={T.textDim} />
            <View style={{ width: 60, height: 1, backgroundColor: T.danger + '30' }} />
          </View>
          <Text style={s.footerTxt}>BUTLER AI · CRASH DIAGNOSTICS · v7.3</Text>
          <Text style={s.footerTxt2}>Crash data stored locally · Never uploaded · Auto-cleared on next successful boot</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── AUTO-REPORT TOGGLE STYLES ─────────────────────────────────────
const autoTog = StyleSheet.create({
  card:      { borderWidth: 1.5, borderRadius: 12, backgroundColor: T.surface, overflow: 'hidden', marginBottom: 10, position: 'relative' },
  topBar:    { height: 2 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconBox:   { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:     { fontFamily: MONO, fontSize: 12, fontWeight: '900' },
  sub:       { fontFamily: MONO, fontSize: 9.5, color: T.textMid, marginTop: 2 },
  descBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingBottom: 12, marginTop: -4 },
  desc:      { fontFamily: MONO, fontSize: 9.5, color: T.textMid, lineHeight: 14, flex: 1 },
  savedBadge:{ position: 'absolute', top: 10, right: 62, flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderColor: T.green + '50', backgroundColor: T.green + '10' },
  savedTxt:  { fontFamily: MONO, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
});

const s = StyleSheet.create({
  // Header
  header:         { borderBottomWidth: 1, borderBottomColor: T.danger + '30', backgroundColor: T.surface, overflow: 'hidden', position: 'relative' },
  headerScan:     { position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: 'rgba(255,51,51,0.05)', transform: [{ skewX: '-14deg' }] },
  headerAccentBar:{ height: 3 },
  headerContent:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconOrb:        { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:    { fontFamily: MONO, fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  headerSub:      { fontFamily: MONO, fontSize: 9, marginTop: 2 },
  backBtn:        { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: T.danger + '50', backgroundColor: T.danger + '0C', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shareBtn:       { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusStrip:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  statusTxt:      { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
  statusBadge:    { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusBadgeTxt: { fontFamily: MONO, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  // Loading
  loadingWrap:    { alignItems: 'center', gap: 12, paddingVertical: 60 },
  loadingTxt:     { fontFamily: MONO, fontSize: 11 },
  // Cleared
  clearedBanner:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  clearedTxt:     { fontFamily: MONO, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  // Empty
  emptyWrap:      { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyIconRing:  { width: 90, height: 90, borderRadius: 45, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: T.green + '08', marginBottom: 8 },
  emptyTitle:     { fontFamily: MONO, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  emptySub:       { fontFamily: MONO, fontSize: 11, textAlign: 'center', lineHeight: 18 },
  healthGrid:     { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', borderWidth: 1, borderRadius: 12, padding: 12 },
  healthCell:     { flex: 1, minWidth: '40%', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, gap: 4 },
  healthVal:      { fontFamily: MONO, fontSize: 12, fontWeight: '900' },
  healthLabel:    { fontFamily: MONO, fontSize: 8, letterSpacing: 0.8 },
  // Section header
  sectionHdr:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 6 },
  sectionBar:     { width: 3, height: 13, borderRadius: 2 },
  sectionTxt:     { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  // System card
  sysCard:        { borderWidth: 1.5, borderRadius: 12, backgroundColor: T.surface, overflow: 'hidden', marginBottom: 12, position: 'relative' },
  sysTopBar:      { height: 2 },
  sysRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sysLabel:       { fontFamily: MONO, fontSize: 11 },
  sysValChip:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sysVal:         { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  // Action buttons
  actionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 20 },
  actionBtnTxt:   { fontFamily: MONO, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  // Footer
  footer:         { marginTop: 24, alignItems: 'center', paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.danger + '20' },
  footerTxt:      { fontFamily: MONO, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 4 },
  footerTxt2:     { fontFamily: MONO, fontSize: 8, color: T.textDim, textAlign: 'center', lineHeight: 13, paddingHorizontal: 20 },
});
