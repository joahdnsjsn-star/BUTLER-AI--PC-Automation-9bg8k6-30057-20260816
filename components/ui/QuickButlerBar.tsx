/**
 * ButlerCommandBar — NEXUS PROMPT v4 · Home/KB Design Language
 * Matches home.tsx + knowledge.tsx aesthetic exactly:
 * Navy BG · Cyan/Amber/Green palette · MONO typography
 * Mixed-case text · Centered pill layout · Scan sweep
 * © 2026 Andrej Sladkovic — Butler AI — ALL RIGHTS RESERVED
 */
import React, {
  useState, useRef, useEffect, useCallback, memo,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, Animated, Dimensions, Keyboard, ScrollView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptics } from '@/services/haptics';
import { askButler, listOllamaModels, clearAskContext } from '@/services/butlerAsk';

export const BUTLER_PREFILL_KEY = '@butler_prefill_prompt';

const SW   = Math.max(320, Dimensions.get('window').width);
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

// ── Palette — exactly matches home.tsx / knowledge.tsx ─────────
const BG    = '#070A10';
const SURF  = '#0B0F17';
const SURF2 = '#111621';
const CYAN  = '#38D9E8';
const GREEN = '#2FE38A';
const AMBER = '#FFB43D';
const PURP  = '#A468FF';
const TEAL  = '#38D9E8';
const BLUE  = '#4A9EFF';
const DIM   = '#4A9EFF';
const MID   = '#4A9EFF';
const TEXT  = '#DCE6F2';

// ── Quick command chips ─────────────────────────────────────────
const CHIPS = [
  { icon: 'monitor-dashboard',     label: 'Pc Health',   msg: 'Show full PC health: CPU, RAM, disk, temperature, and top processes', color: CYAN  },
  { icon: 'broom',                  label: 'Clean Temp',  msg: 'Write Python to clean all temp files and show how many MB were freed', color: TEAL  },
  { icon: 'network-outline',        label: 'Lan Scan',    msg: 'Scan my local network and list all connected devices with IPs',       color: GREEN },
  { icon: 'cpu-64-bit',             label: 'Top Procs',   msg: 'Show the top 8 CPU-consuming processes on my PC right now',           color: AMBER },
  { icon: 'shield-lock-outline',    label: 'Security',    msg: 'Run a quick security audit: open ports, firewall status, and risks',  color: PURP  },
  { icon: 'code-braces',            label: 'Write Script',msg: 'Write a Python automation script to: ',                              color: BLUE  },
  { icon: 'harddisk',               label: 'Disk Usage',  msg: 'Show disk usage breakdown by folder and find the largest files',     color: AMBER },
  { icon: 'database-refresh-outline',label:'Memory',      msg: 'Show RAM usage details and suggest ways to free up memory',          color: CYAN  },
] as const;

// ── PulseDot — reused from home/knowledge ──────────────────────
const PulseDot = memo(({ color, size = 5 }: { color: string; size?: number }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.2, duration: 800, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />
  );
});

// ── Chip row item ───────────────────────────────────────────────
const ChipItem = memo(({ item, onPress }: { item: typeof CHIPS[number]; onPress: () => void }) => {
  const scaleA = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scaleA, { toValue: 0.92, duration: 55, useNativeDriver: true }),
      Animated.spring(scaleA, { toValue: 1, tension: 260, friction: 10, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleA }] }}>
      <TouchableOpacity onPress={press} activeOpacity={0.85}
        style={[CS.chip, { borderColor: item.color + '45', backgroundColor: item.color + '0C' }]}>
        <MaterialCommunityIcons name={item.icon as any} size={12} color={item.color} />
        <Text style={[CS.chipTxt, { color: item.color }]}>{item.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});
const CS = StyleSheet.create({
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  chipTxt: { fontFamily: MONO, fontSize: 9.5, fontWeight: '900' },
});

// ── Status meta pills (centered) ────────────────────────────────
const MetaStrip = memo(({ isConn }: { isConn: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
    {[
      { dot: isConn ? GREEN : AMBER, text: isConn ? 'Connected' : 'Offline' },
      { dot: CYAN,  text: 'Lan Only' },
      { dot: PURP,  text: 'Aes-256' },
      { dot: GREEN, text: 'Zero Cloud' },
    ].map((m, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <PulseDot color={m.dot} size={4} />
        <Text style={{ fontFamily: MONO, fontSize: 7.5, color: MID, fontWeight: '700' }}>{m.text}</Text>
      </View>
    ))}
  </View>
));

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function QuickButlerBar() {
  const router = useRouter();

  const [text,       setText]       = useState('');
  const [expanded,   setExpanded]   = useState(false);
  const [focused,    setFocused]    = useState(false);
  const [isConn,     setIsConn]     = useState(false);
  const [answer,     setAnswer]     = useState('');       // inline Ollama reply
  const [asking,     setAsking]     = useState(false);
  const [lastQ,      setLastQ]      = useState('');
  const [model,      setModel]      = useState('');

  const inputRef   = useRef<TextInput>(null);
  const expandA    = useRef(new Animated.Value(0)).current;
  const scanX      = useRef(new Animated.Value(-SW)).current;
  const sendScA    = useRef(new Animated.Value(1)).current;
  const borderA    = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  // Check connection on mount
  useEffect(() => {
    mountedRef.current = true;
    try {
      const { serverConnection } = require('@/services/serverConnection');
      setIsConn(serverConnection.isConnected?.() ?? false);
    } catch {}

    // Which local Ollama model is answering — badge only, never blocks input.
    listOllamaModels().then((names) => {
      if (mountedRef.current && names[0]) setModel(names[0]);
    }).catch(() => {});

    // Scan sweep loop — same as home/knowledge headers
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue: SW + 100, duration: 3000, useNativeDriver: true }),
      Animated.timing(scanX, { toValue: -SW, duration: 0, useNativeDriver: true }),
      Animated.delay(7000),
    ]));
    loop.start();

    return () => { mountedRef.current = false; loop.stop(); };
  }, []);

  // Border glow on focus
  useEffect(() => {
    Animated.timing(borderA, { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  }, [focused]);

  const borderColor = borderA.interpolate({
    inputRange: [0, 1],
    outputRange: [DIM + '80', CYAN + 'AA'],
  });

  const toggleExpand = useCallback(() => {
    haptics.light();
    const next = !expanded;
    setExpanded(next);
    Animated.spring(expandA, { toValue: next ? 1 : 0, tension: 80, friction: 13, useNativeDriver: false }).start();
    if (!next) Keyboard.dismiss();
  }, [expanded]);

  const chipHeight = expandA.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
  const chipOpacity = expandA.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  /** Ask inline — the answer lands right above the bar, no tab switch. */
  const sendMessage = useCallback(async (msg?: string) => {
    const prompt = (msg || text).trim();
    haptics.heavy();

    Animated.sequence([
      Animated.timing(sendScA, { toValue: 0.75, duration: 60, useNativeDriver: true }),
      Animated.spring(sendScA, { toValue: 1, tension: 240, friction: 10, useNativeDriver: true }),
    ]).start();

    if (!prompt || asking) return;

    // Keep the full transcript in sync so "open chat" continues the thread.
    try { await AsyncStorage.setItem(BUTLER_PREFILL_KEY, prompt); } catch {}

    setText('');
    setLastQ(prompt);
    setAnswer('');
    setAsking(true);
    Keyboard.dismiss();
    setExpanded(false);
    Animated.timing(expandA, { toValue: 0, duration: 180, useNativeDriver: false }).start();

    const r = await askButler(prompt);
    if (!mountedRef.current) return;
    setIsConn(r.online);
    if (r.model) setModel(r.model);
    setAnswer(r.error ? `${r.reply}\n\n(${r.error})` : r.reply);
    setAsking(false);
    haptics.success();
  }, [text, asking]);

  /** Hand the current thread to the full AI CHAT tab. */
  const openFullChat = useCallback(async () => {
    haptics.medium();
    const q = lastQ;
    setAnswer('');
    if (q) {
      try { await AsyncStorage.setItem(BUTLER_PREFILL_KEY, q); } catch {}
      try { (global as any).__butlerInjectMessage?.(q); } catch {}
    }
    try { router.push('/(tabs)/butler' as any); } catch {}
  }, [lastQ]);

  const dismissAnswer = useCallback(() => {
    haptics.light();
    setAnswer('');
    setLastQ('');
    clearAskContext();
  }, []);

  const handleChip = useCallback((msg: string) => {
    haptics.medium();
    // A chip ending in ':' is a template — drop it in the field to finish typing.
    if (msg.trim().endsWith(':')) { setText(msg); inputRef.current?.focus(); return; }
    sendMessage(msg);
  }, [sendMessage]);

  const ready = text.trim().length > 0;

  return (
    <View style={B.outer} pointerEvents="box-none">
      {/* ── INLINE ANSWER — local Ollama reply, no tab switch ── */}
      {(asking || !!answer) && (
        <View style={B.ansCard}>
          <View style={B.ansHead}>
            <MaterialCommunityIcons name="robot-happy-outline" size={13} color={CYAN} />
            <Text style={B.ansTitle} numberOfLines={1}>
              {asking ? 'Butler Ai is thinking…' : (model ? model.split(':')[0].toUpperCase() : (isConn ? 'OLLAMA' : 'OFFLINE'))}
            </Text>
            <PulseDot color={asking ? AMBER : (isConn ? GREEN : AMBER)} size={4} />
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={dismissAnswer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={14} color={MID} />
            </TouchableOpacity>
          </View>

          {asking ? (
            <Text style={B.ansBody}>Routing through your paired PC…</Text>
          ) : (
            <ScrollView style={{ maxHeight: 132 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Text style={B.ansBody} selectable>{answer}</Text>
            </ScrollView>
          )}

          {!asking && (
            <TouchableOpacity onPress={openFullChat} activeOpacity={0.85} style={B.ansBtn}>
              <MaterialIcons name="forum" size={12} color={CYAN} />
              <Text style={B.ansBtnTxt}>Continue in Ai Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Animated.View style={[B.card, { borderColor }]}>
        {/* Top accent stripe — same as home.tsx 3px stripe */}
        <View style={{ height: 2.5, backgroundColor: CYAN, opacity: 0.7 }} />

        {/* Scan sweep — identical to home/knowledge headers */}
        <Animated.View
          pointerEvents="none"
          style={[B.scan, { transform: [{ translateX: scanX }] }]}
        />

        {/* ── MAIN PROMPT ROW ── */}
        <View style={B.promptRow}>
          {/* Robot icon button — left side */}
          <TouchableOpacity
            onPress={toggleExpand}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 6 }}
            style={[B.avatarBtn, {
              borderColor: expanded ? CYAN + '80' : DIM + '80',
              backgroundColor: expanded ? CYAN + '12' : DIM + '30',
            }]}>
            <MaterialCommunityIcons
              name="robot-happy-outline"
              size={16}
              color={expanded ? CYAN : MID}
            />
            {/* Unread / online dot */}
            <View style={[B.onlineDot, { backgroundColor: isConn ? GREEN : AMBER }]} />
          </TouchableOpacity>

          {/* Input field — centered text area */}
          <TouchableOpacity
            onPress={() => { inputRef.current?.focus(); if (!expanded) { setExpanded(true); Animated.spring(expandA, { toValue: 1, tension: 80, friction: 13, useNativeDriver: false }).start(); } }}
            activeOpacity={1}
            style={B.inputTouchable}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => { setFocused(true); if (!expanded) { setExpanded(true); Animated.spring(expandA, { toValue: 1, tension: 80, friction: 13, useNativeDriver: false }).start(); } }}
              onBlur={() => setFocused(false)}
              placeholder="Ask Butler Ai anything…"
              placeholderTextColor={MID}
              style={B.input}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage()}
              maxLength={600}
              underlineColorAndroid="transparent"
              keyboardAppearance="dark"
              selectionColor={CYAN}
            />
          </TouchableOpacity>

          {/* Right action group */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Chevron expand toggle */}
            <TouchableOpacity onPress={toggleExpand} activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Animated.View style={{
                transform: [{ rotate: expandA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
              }}>
                <MaterialIcons name="expand-less" size={16} color={expanded ? CYAN : MID} />
              </Animated.View>
            </TouchableOpacity>

            {/* Send button — matches home.tsx pill style */}
            <Animated.View style={{ transform: [{ scale: sendScA }] }}>
              <TouchableOpacity
                onPress={() => sendMessage()}
                activeOpacity={0.85}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                style={[B.sendBtn, ready
                  ? { backgroundColor: CYAN, borderColor: CYAN }
                  : { backgroundColor: DIM + '50', borderColor: DIM + '80' },
                ]}>
                <MaterialIcons name={ready ? 'send' : 'keyboard-arrow-right'} size={15}
                  color={ready ? '#000' : MID} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ── STATUS ROW — centered meta pills ── */}
        <View style={B.statusRow}>
          {focused || text.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <PulseDot color={CYAN} size={4} />
              <Text style={{ fontFamily: MONO, fontSize: 7.5, color: CYAN + '70', fontWeight: '900', letterSpacing: 0.8 }}>
                {ready ? `${text.length} chars · Press ↵ to send` : 'Butler Ai · Local Llm · Zero Cloud'}
              </Text>
            </View>
          ) : (
            <MetaStrip isConn={isConn} />
          )}
        </View>

        {/* ── EXPANDED SECTION — chips ── */}
        <Animated.View style={{ maxHeight: chipHeight, overflow: 'hidden', opacity: chipOpacity }}>
          <View style={B.chipSection}>
            {/* Section label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <View style={{ width: 2.5, height: 11, borderRadius: 1.5, backgroundColor: AMBER }} />
              <Text style={{ fontFamily: MONO, fontSize: 8.5, color: AMBER + '80', fontWeight: '900', letterSpacing: 1.5 }}>
                Quick Commands
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: DIM + '80' }} />
              <TouchableOpacity
                onPress={() => { haptics.light(); try { router.push('/(tabs)/butler' as any); } catch {} }}
                activeOpacity={0.8}>
                <Text style={{ fontFamily: MONO, fontSize: 8.5, color: CYAN, fontWeight: '900' }}>Open Ai {'>'}</Text>
              </TouchableOpacity>
            </View>

            {/* Chip scroll — same pattern as knowledge category chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7 }}
              keyboardShouldPersistTaps="handled">
              {CHIPS.map((c, i) => (
                <ChipItem key={i} item={c} onPress={() => handleChip(c.msg)} />
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── Styles — navy/dark matching home.tsx palette ────────────────
const B = StyleSheet.create({
  ansCard: {
    marginHorizontal: 10, marginBottom: 6, borderRadius: 14, borderWidth: 1.5,
    borderColor: CYAN + '45', backgroundColor: SURF2, paddingHorizontal: 11,
    paddingTop: 8, paddingBottom: 9, gap: 6,
  },
  ansHead:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ansTitle: { fontFamily: MONO, fontSize: 8.5, fontWeight: '900', color: CYAN, letterSpacing: 0.9 },
  ansBody:  { fontFamily: MONO, fontSize: 11.5, lineHeight: 18, color: TEXT },
  ansBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: CYAN + '55', backgroundColor: CYAN + '12',
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
  },
  ansBtnTxt: { fontFamily: MONO, fontSize: 9, fontWeight: '900', color: CYAN, letterSpacing: 0.6 },

  outer: {
    width: '100%',
    paddingHorizontal: 8,
    paddingBottom: 3,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: SURF,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios:     { shadowColor: CYAN, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 10 },
    }),
  },
  scan: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 80,
    backgroundColor: CYAN + '07',
    pointerEvents: 'none' as any,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    zIndex: 1,
  },
  avatarBtn: {
    width: 32, height: 32,
    borderRadius: 9, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, position: 'relative',
  },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1.5, borderColor: SURF,
  },
  inputTouchable: { flex: 1 },
  input: {
    fontFamily: MONO,
    fontSize: 12.5,
    fontWeight: '700',
    color: TEXT,
    padding: 0,
    height: 30,
    includeFontPadding: false,
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 9, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  statusRow: {
    paddingHorizontal: 10,
    paddingBottom: 7,
    paddingTop: 0,
    minHeight: 18,
    justifyContent: 'center',
  },
  chipSection: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: DIM + '70',
  },
});
