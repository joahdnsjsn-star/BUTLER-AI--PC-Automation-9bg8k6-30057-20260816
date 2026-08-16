/**
 * BUTLER AI — Chat v15 · Fresh Rebuild
 * Clean message bubbles · Mode tabs · Streaming simulation
 * Session management · Suggestions · Voice placeholder
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Animated, Platform, Dimensions, KeyboardAvoidingView,
  ActivityIndicator, Pressable, Modal,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { haptics } from '@/services/haptics';

const BG    = '#0B0F17';
const SURF  = '#0B0F17';
const SURF2 = '#111621';
const PURP  = '#A468FF';
const CYAN  = '#38D9E8';
const GREEN = '#2FE38A';
const AMBER = '#FFB43D';
const RED   = '#FF4D5E';
const BLUE  = '#4A9EFF';
const DIM   = '#4A9EFF';
const MID   = '#4A9EFF';
const TEXT  = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW    = Math.max(320, Dimensions.get('window').width);

type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; ts: number; };

const MODES = [
  { key:'chat',   label:'CHAT',   icon:'chat-outline',  color:PURP,  desc:'General assistant' },
  { key:'code',   label:'CODE',   icon:'code-braces',   color:CYAN,  desc:'Python & scripting' },
  { key:'system', label:'SYSTEM', icon:'server',        color:GREEN, desc:'PC diagnostics' },
];

const SUGGESTIONS = [
  { text:'What can you do right now?',    icon:'help-circle-outline' },
  { text:'Scan my LAN for active hosts',  icon:'network-outline'     },
  { text:'Free up disk space safely',     icon:'harddisk'            },
  { text:'Show top CPU processes',        icon:'cpu-64-bit'          },
  { text:'Write a backup script',         icon:'code-braces'         },
  { text:'Explain my system specs',       icon:'information-outline'  },
];

// ── PulseDot ─────────────────────────────────────────────────────
const PulseDot = memo(({ color, size = 6 }: { color: string; size?: number }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.2, duration: 700, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />;
});

// ── Message bubble ────────────────────────────────────────────────
const MsgBubble = memo(({ msg, activeMode }: { msg: Message; activeMode: string }) => {
  const isUser   = msg.role === 'user';
  const isSystem = msg.role === 'system';
  const modeColor = MODES.find(m => m.key === activeMode)?.color ?? PURP;
  const color = isUser ? modeColor : isSystem ? AMBER + 'CC' : PURP;
  const fade   = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(isUser ? 20 : -20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideX,{ toValue: 0, tension: 200, friction: 16, useNativeDriver: true }),
    ]).start();
  }, []);

  const ts = new Date(msg.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  return (
    <Animated.View style={[
      MB.row,
      isUser && { alignSelf:'flex-end', flexDirection:'row-reverse' },
      { opacity: fade, transform: [{ translateX: slideX }] },
    ]}>
      <View style={[MB.avatar, { borderColor: color + '50', backgroundColor: color + '10' }]}>
        <MaterialCommunityIcons
          name={isUser ? 'account' : isSystem ? 'information' : 'robot-happy'}
          size={12} color={color} />
      </View>
      <View style={{ maxWidth: SW * 0.76, gap: 3 }}>
        {!isUser && (
          <Text style={[MB.role, { color }]}>{isSystem ? 'SYSTEM' : 'BUTLER AI'}</Text>
        )}
        <View style={[MB.bubble, {
          borderColor: color + '28',
          backgroundColor: isUser ? color + '0E' : SURF2,
          borderLeftWidth: isUser ? 0 : 3,
          borderRightWidth: isUser ? 3 : 0,
          borderLeftColor: isUser ? undefined : color,
          borderRightColor: isUser ? color : undefined,
        }]}>
          <Text style={[MB.content, { color: isUser ? color + 'EE' : TEXT }]}>
            {msg.content}
          </Text>
        </View>
        <Text style={[MB.ts, { alignSelf: isUser ? 'flex-end' : 'flex-start' }]}>{ts}</Text>
      </View>
    </Animated.View>
  );
});
const MB = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'flex-end', gap:8, paddingHorizontal:12, marginBottom:10 },
  avatar:  { width:26, height:26, borderRadius:8, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  role:    { fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.8, paddingLeft:2 },
  bubble:  { borderWidth:1.5, borderRadius:14, padding:12, paddingTop:10 },
  content: { fontFamily:MONO, fontSize:13, lineHeight:20 },
  ts:      { fontFamily:MONO, fontSize:8, color:MID },
});

// ── Typing indicator ──────────────────────────────────────────────
const TypingDots = memo(({ color }: { color: string }) => {
  const a0 = useRef<Animated.Value | null>(null);
  const a1 = useRef<Animated.Value | null>(null);
  const a2 = useRef<Animated.Value | null>(null);
  if (!a0.current) a0.current = new Animated.Value(0.15);
  if (!a1.current) a1.current = new Animated.Value(0.15);
  if (!a2.current) a2.current = new Animated.Value(0.15);
  const anims = [a0.current, a1.current, a2.current];
  useEffect(() => {
    const loops = anims.map((a, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 150),
      Animated.timing(a, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.1, duration: 380, useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start()); return () => loops.forEach(l => l.stop());
  }, []);
  return (
    <View style={{ flexDirection:'row', alignItems:'flex-end', gap:8, paddingHorizontal:12, marginBottom:10 }}>
      <View style={[MB.avatar, { borderColor: color+'50', backgroundColor: color+'10' }]}>
        <MaterialCommunityIcons name="robot-happy" size={12} color={color} />
      </View>
      <View style={[MB.bubble, { borderColor:color+'28', backgroundColor:SURF2, borderLeftWidth:3, borderLeftColor:color }]}>
        <View style={{ flexDirection:'row', gap:5, alignItems:'center', padding:2 }}>
          {anims.map((a, i) => (
            <Animated.View key={i} style={{ width:7, height:7, borderRadius:3.5, backgroundColor:color, opacity:a }} />
          ))}
        </View>
      </View>
    </View>
  );
});

// ── Header ────────────────────────────────────────────────────────
const ButlerHeader = memo(({ safeTop, isConn, model, msgCount, onClear, onHistory }: {
  safeTop:number; isConn:boolean; model:string; msgCount:number;
  onClear:()=>void; onHistory:()=>void;
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
      Animated.timing(scanX, { toValue:SW+120, duration:2400, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(5000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  const cc = isConn ? GREEN : AMBER;

  return (
    <View style={[BH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="BH" still={!S.headerGlow} />
      <View style={{ height:3, backgroundColor:PURP }} />
      <Animated.View pointerEvents="none" style={[BH.scan, { transform:[{ translateX:scanX }] }]} />
      <View style={BH.body}>
        <View style={{ flex:1, gap:4 }}>
          <Text style={BH.eye}>LOCAL OLLAMA · PRIVATE · ZERO CLOUD</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <MaterialCommunityIcons name="robot-happy" size={18} color={PURP} />
            <Text style={BH.title}>BUTLER <Text style={{ color:PURP }}>AI</Text></Text>
          </View>
          <View style={{ flexDirection:'row', gap:6, flexWrap:'wrap' }}>
            <View style={[BH.pill, { borderColor:cc+'70', backgroundColor:cc+'10' }]}>
              <PulseDot color={cc} size={5} />
              <Text style={[BH.pTxt, { color:cc }]}>{isConn ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
            {model ? (
              <View style={[BH.pill, { borderColor:PURP+'50', backgroundColor:PURP+'08' }]}>
                <MaterialCommunityIcons name="brain" size={9} color={PURP} />
                <Text style={[BH.pTxt, { color:PURP }]}>{model.split(':')[0].toUpperCase()}</Text>
              </View>
            ) : null}
            {msgCount > 0 && (
              <View style={[BH.pill, { borderColor:DIM+'60', backgroundColor:DIM+'20' }]}>
                <Text style={[BH.pTxt, { color:MID }]}>{msgCount} MSG</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems:'flex-end', gap:6 }}>
          <View style={{ flexDirection:'row', alignItems:'baseline', gap:1 }}>
            <Text style={[BH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={[BH.cSec, { color:PURP }]}>{ss}</Text>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={onHistory} activeOpacity={0.8}
              hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <MaterialIcons name="history" size={18} color={MID} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClear} activeOpacity={0.8}
              hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <MaterialIcons name="delete-sweep" size={18} color={RED + '90'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={{ height:2, backgroundColor:PURP+'30' }} />
    </View>
  );
});
const BH = StyleSheet.create({
  root: { backgroundColor:'#0B0F17', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor:PURP+'06' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, color:PURP+'60', letterSpacing:1.8, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSec: { fontFamily:MONO, fontSize:14, fontWeight:'900' },
});

// ── Mode bar ──────────────────────────────────────────────────────
const ModeBar = memo(({ mode, onChange }: { mode: string; onChange: (m: string) => void }) => (
  <View style={{ flexDirection:'row', backgroundColor:SURF, borderBottomWidth:1, borderBottomColor:DIM+'50' }}>
    {MODES.map(m => {
      const active = mode === m.key;
      return (
        <TouchableOpacity key={m.key} onPress={() => { haptics.light(); onChange(m.key); }} activeOpacity={0.8}
          style={{ flex:1, alignItems:'center', paddingVertical:9, gap:2,
            borderBottomWidth:2, borderBottomColor: active ? m.color : 'transparent' }}>
          <MaterialCommunityIcons name={m.icon as any} size={14} color={active ? m.color : MID} />
          <Text style={{ fontFamily:MONO, fontSize:8.5, fontWeight:'900', color: active ? m.color : MID, letterSpacing:0.4 }}>
            {m.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
));

// ── Session history modal ─────────────────────────────────────────
const HistoryModal = memo(({ visible, sessions, onSelect, onNew, onClose }: {
  visible:boolean; sessions:{id:string; title:string; count:number; ts:number}[];
  onSelect:(id:string)=>void; onNew:()=>void; onClose:()=>void;
}) => {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:SURF, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'70%' }}>
          <View style={{ height:3, backgroundColor:PURP }} />
          <View style={{ flexDirection:'row', alignItems:'center', gap:10, padding:16 }}>
            <MaterialIcons name="history" size={18} color={PURP} />
            <Text style={{ fontFamily:MONO, fontSize:15, fontWeight:'900', color:TEXT, flex:1 }}>SESSION HISTORY</Text>
            <TouchableOpacity onPress={onNew} activeOpacity={0.8}
              style={{ flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:10, paddingHorizontal:10, paddingVertical:6, borderColor:GREEN+'60', backgroundColor:GREEN+'10' }}>
              <MaterialIcons name="add" size={14} color={GREEN} />
              <Text style={{ fontFamily:MONO, fontSize:9.5, color:GREEN, fontWeight:'900' }}>NEW</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={{ padding:4 }}>
              <MaterialIcons name="close" size={20} color={MID} />
            </TouchableOpacity>
          </View>
          {sessions.length === 0 ? (
            <View style={{ alignItems:'center', padding:40, gap:10 }}>
              <MaterialCommunityIcons name="chat-outline" size={40} color={DIM} />
              <Text style={{ fontFamily:MONO, fontSize:12, color:MID }}>No saved sessions yet</Text>
            </View>
          ) : (
            sessions.map((s, i) => {
              const ago = Math.round((Date.now() - s.ts) / 60000);
              const agoStr = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago/60)}h ago`;
              return (
                <TouchableOpacity key={s.id} onPress={() => { onSelect(s.id); onClose(); }} activeOpacity={0.8}
                  style={{ flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderBottomColor:DIM+'50' }}>
                  <View style={{ width:36, height:36, borderRadius:10, borderWidth:1.5, borderColor:PURP+'40', backgroundColor:PURP+'10', alignItems:'center', justifyContent:'center' }}>
                    <MaterialCommunityIcons name="chat-outline" size={16} color={PURP} />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontFamily:MONO, fontSize:12, fontWeight:'700', color:TEXT }} numberOfLines={1}>{s.title}</Text>
                    <Text style={{ fontFamily:MONO, fontSize:9, color:MID, marginTop:2 }}>{s.count} messages · {agoStr}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={MID} />
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height:20 }} />
        </View>
      </View>
    </Modal>
  );
});

// ── Offline reply generator ───────────────────────────────────────
function offlineReply(text: string, mode: string): string {
  const t = text.toLowerCase();
  if (/hello|hi|hey/.test(t)) return 'Hello! Connect your PC to unlock full local AI via Ollama. Go to PAIR tab.';
  if (/help|what can|capabilities/.test(t)) return 'I can run Python scripts, monitor your PC health, analyze system data, and answer questions via local Ollama AI — 100% offline, zero cloud.';
  if (/script|python|code|automat/.test(t)) return 'Tap the FORGE tab to browse 250+ automation scripts. Run them directly on your paired PC with one tap.';
  if (/pair|connect|qr/.test(t)) return 'Run butler_server.py on your PC, then tap PAIR tab and scan the QR code. Auto-setup handles everything.';
  if (/security|safe|private|encrypt/.test(t)) return 'Butler AI uses AES-256-GCM encryption, HMAC-SHA256 token signing, and LAN-only communication. Zero telemetry, zero cloud.';
  if (/memory|ram|cpu|disk|performance/.test(t)) return mode === 'system'
    ? 'Pair your PC to get live CPU/RAM/disk data. I can run psutil scripts to analyze performance in detail.'
    : 'Go to HOME to see your PC system metrics in real time once paired.';
  if (/ollama|model|llm|ai/.test(t)) return 'I run on Ollama — a local LLM engine. Recommended model: qwen2.5-coder:7b. After pairing, I can auto-download the best model for your hardware.';
  return 'Pair your PC first for full Butler AI. I have 250+ scripts, system monitoring, file transfer, and a local AI chat engine ready to go.';
}

// ── Main screen ───────────────────────────────────────────────────
function ButlerInner() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([
    { id:'sys0', role:'system', content:'Butler AI ready. Pair your PC via QR code to unlock full local AI, script execution, and system monitoring.', ts:Date.now() },
  ]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [isConn, setIsConn]     = useState(false);
  const [model, setModel]       = useState('');
  const [mode, setMode]         = useState('chat');
  const [showHistory, setShowHistory] = useState(false);
  const [sessions] = useState<{id:string; title:string; count:number; ts:number}[]>([]);
  const listRef  = useRef<FlatList<Message>>(null);
  const sendRef  = useRef(false);

  useFocusEffect(useCallback(() => {
    const c = serverConnection.isConnected?.() ?? false;
    setIsConn(c);
    if (c) fetchModel();
  }, []));

  const fetchModel = async () => {
    try {
      const ip  = serverConnection.getIP?.()   || '';
      const prt = serverConnection.getPort?.() || '';
      if (!ip || !prt) return;
      const tok = serverConnection.getToken?.() || '';
      const h: Record<string,string> = {};
      if (tok) h['Authorization'] = 'Bearer ' + tok;
      const res = await fetch(`http://${ip}:${prt}/api/ollama/models`, { headers:h });
      if (res.ok) {
        const d = await res.json();
        const list: string[] = Array.isArray(d) ? d : (d.models ?? []);
        const priority = ['qwen2.5-coder','qwen2.5','mistral','llama3.2','llama3','codellama','phi'];
        const best = priority.find(p => list.some(m => m.toLowerCase().includes(p))) || list[0] || '';
        setModel(best);
      }
    } catch {}
  };

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const sendMessage = useCallback(async (content?: string) => {
    const text = (content || input).trim();
    if (!text || sendRef.current) return;
    sendRef.current = true;
    haptics.medium();
    setInput('');
    const userMsg: Message = { id:Date.now().toString(), role:'user', content:text, ts:Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    scrollToEnd();

    try {
      if (!isConn) {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
        const reply = offlineReply(text, mode);
        setMessages(prev => [...prev, { id:Date.now().toString(), role:'assistant', content:reply, ts:Date.now() }]);
        haptics.success();
      } else {
        const ip  = serverConnection.getIP?.()   || '';
        const prt = serverConnection.getPort?.() || '';
        const tok = serverConnection.getToken?.() || '';
        const h: Record<string,string> = { 'Content-Type':'application/json' };
        if (tok) h['Authorization'] = 'Bearer ' + tok;
        const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 35000);
        const sysPrompt = mode === 'code'
          ? 'You are an expert Python coder and system administrator. Always provide working code.'
          : mode === 'system'
          ? 'You are a system administrator AI. Be precise, technical, and include actionable commands.'
          : 'You are Butler AI — a helpful, private, local PC assistant. Be concise and practical.';
        const res = await fetch(`http://${ip}:${prt}/api/butler/chat`, {
          method:'POST', headers:h,
          body: JSON.stringify({
            messages: [
              { role:'system', content:sysPrompt },
              ...messages.slice(-12).map(m => ({ role: m.role==='system'?'assistant':m.role, content:m.content })),
              { role:'user', content:text },
            ]
          }),
          signal: ctrl.signal,
        });
        const d = await res.json();
        const reply = (d.reply || d.content || d.message || '').trim() || 'Done.';
        setMessages(prev => [...prev, { id:Date.now().toString(), role:'assistant', content:reply, ts:Date.now() }]);
        haptics.success();
      }
    } catch (e: any) {
      const err = e?.name==='AbortError' ? 'Request timed out (35s)' : (e?.message?.slice(0,100) || 'Request failed');
      setMessages(prev => [...prev, { id:Date.now().toString(), role:'assistant', content:'Error: ' + err, ts:Date.now() }]);
    } finally {
      sendRef.current = false;
      setSending(false);
      scrollToEnd();
    }
  }, [input, isConn, mode, messages, scrollToEnd]);

  const clearChat = useCallback(() => {
    haptics.medium();
    setMessages([{ id:'sys'+Date.now(), role:'system', content:'Session cleared. Butler AI ready.', ts:Date.now() }]);
  }, []);

  const activeMode = MODES.find(m => m.key === mode) ?? MODES[0];
  const modeColor = activeMode.color;
  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const isEmpty = userMsgCount === 0;
  // Long context warning: Ollama sends the full history on every request.
  // After 15 user turns the context window grows large and responses slow down.
  const isLongContext = userMsgCount >= 15;

  const renderItem = useCallback(({ item }: { item: Message }) => (
    <MsgBubble msg={item} activeMode={mode} />
  ), [mode]);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <ButlerHeader
        safeTop={insets.top} isConn={isConn} model={model}
        msgCount={userMsgCount} onClear={clearChat}
        onHistory={() => setShowHistory(true)} />
      <ModeBar mode={mode} onChange={setMode} />
      <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:12, paddingVertical:8, backgroundColor:SURF2, borderBottomWidth:1, borderBottomColor:DIM+'45' }}>
        <View style={{ borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4, borderColor:modeColor+'55', backgroundColor:modeColor+'10' }}>
          <Text style={{ fontFamily:MONO, fontSize:8.5, color:modeColor, fontWeight:'900', letterSpacing:0.5 }}>
            {activeMode.label} MODE
          </Text>
        </View>
        <Text numberOfLines={1} style={{ flex:1, fontFamily:MONO, fontSize:8.5, color:MID, lineHeight:13 }}>
          {activeMode.desc}
        </Text>
        <TouchableOpacity onPress={() => setShowHistory(true)} activeOpacity={0.8}
          style={{ flexDirection:'row', alignItems:'center', gap:4, borderWidth:1.5, borderRadius:10, paddingHorizontal:8, paddingVertical:6, borderColor:CYAN+'45', backgroundColor:CYAN+'0C' }}>
          <MaterialIcons name="history" size={13} color={CYAN} />
          <Text style={{ fontFamily:MONO, fontSize:8, color:CYAN, fontWeight:'900' }}>HISTORY</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearChat} activeOpacity={0.8}
          style={{ flexDirection:'row', alignItems:'center', gap:4, borderWidth:1.5, borderRadius:10, paddingHorizontal:8, paddingVertical:6, borderColor:RED+'45', backgroundColor:RED+'0A' }}>
          <MaterialIcons name="delete-sweep" size={13} color={RED} />
          <Text style={{ fontFamily:MONO, fontSize:8, color:RED, fontWeight:'900' }}>CLEAR</Text>
        </TouchableOpacity>
      </View>

      {/* Long context warning — shown when conversation history grows large */}
      {isLongContext && (
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:12, paddingVertical:8,
          backgroundColor: AMBER+'12', borderBottomWidth:1.5, borderBottomColor: AMBER+'40' }}>
          <MaterialIcons name="warning" size={14} color={AMBER} />
          <Text style={{ fontFamily:MONO, fontSize:9.5, color:AMBER, flex:1, lineHeight:14 }}>
            {'LONG CONTEXT · '}
            <Text style={{ fontWeight:'900' }}>{userMsgCount} turns</Text>
            {' sent with every request — AI will slow down. Clear chat to speed up.'}
          </Text>
          <TouchableOpacity onPress={clearChat} activeOpacity={0.8}
            style={{ borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:4,
              borderColor:AMBER+'60', backgroundColor:AMBER+'10' }}>
            <Text style={{ fontFamily:MONO, fontSize:8.5, color:AMBER, fontWeight:'900' }}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios' ? 'padding' : 'height'}>
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop:12, paddingBottom:6 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          ListFooterComponent={sending ? <TypingDots color={modeColor} /> : null}
          onContentSizeChange={scrollToEnd}
        />

        {/* Suggestions when empty */}
        {isEmpty && !sending && (
          <View style={{ paddingHorizontal:12, paddingBottom:10 }}>
            <Text style={{ fontFamily:MONO, fontSize:8.5, color:PURP+'60', letterSpacing:1.5, textAlign:'center', marginBottom:10 }}>
              SUGGESTED PROMPTS
            </Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:7, justifyContent:'center' }}>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => sendMessage(s.text)} activeOpacity={0.8}
                  style={{ flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:11, paddingVertical:7, borderColor:PURP+'35', backgroundColor:PURP+'08' }}>
                  <MaterialCommunityIcons name={s.icon as any} size={11} color={PURP+'80'} />
                  <Text style={{ fontFamily:MONO, fontSize:10, color:PURP+'BB' }}>{s.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input bar */}
        <View style={[IB.root, { paddingBottom: Math.max(insets.bottom+6, 10), borderTopColor: modeColor+'20' }]}>
          {/* Mode indicator strip */}
          <View style={{ flexDirection:'row', justifyContent:'center', gap:16, marginBottom:7 }}>
            {['AES-256', 'LAN ONLY', isConn ? model.split(':')[0].toUpperCase() || 'OLLAMA' : 'OFFLINE', 'ZERO CLOUD'].map((l, i) => (
              <Text key={i} style={{ fontFamily:MONO, fontSize:8, color:[modeColor, GREEN, isConn?PURP:AMBER, CYAN][i]+'50', fontWeight:'900' }}>
                {l}
              </Text>
            ))}
          </View>

          <View style={[IB.row, { borderColor: input.trim() ? modeColor+'60' : DIM+'50' }]}>
            {/* Mode icon */}
            <MaterialCommunityIcons name={MODES.find(m => m.key === mode)?.icon as any ?? 'chat'} size={16} color={modeColor+'80'} />

            {/* Input field */}
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={isConn
                ? `[${mode.toUpperCase()}] Ask Butler anything…`
                : 'Pair PC or ask Butler offline…'}
              placeholderTextColor={MID}
              style={IB.input}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
              editable={!sending}
              multiline
              maxLength={1200}
            />

            {/* Char counter (shows when typing) */}
            {input.length > 100 && (
              <Text style={{ fontFamily:MONO, fontSize:8, color:MID, alignSelf:'flex-end', paddingBottom:2 }}>
                {input.length}
              </Text>
            )}

            {/* Voice button (placeholder) */}
            <TouchableOpacity onPress={() => haptics.light()} activeOpacity={0.8}
              style={{ padding:2 }} disabled={sending}>
              <MaterialIcons name="mic-none" size={18} color={sending ? DIM : modeColor + '60'} />
            </TouchableOpacity>

            {/* Send */}
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={!input.trim() || sending}
              activeOpacity={0.85}
              style={[IB.send, {
                backgroundColor: input.trim() && !sending ? modeColor : DIM + '50',
                borderColor: input.trim() && !sending ? modeColor : DIM,
              }]}>
              {sending
                ? <ActivityIndicator size="small" color={modeColor} style={{ transform:[{ scale:0.75 }] }} />
                : <MaterialIcons name="send" size={16} color={input.trim() ? '#000' : MID} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Session history modal */}
      <HistoryModal
        visible={showHistory}
        sessions={sessions}
        onSelect={() => {}}
        onNew={clearChat}
        onClose={() => setShowHistory(false)}
      />
    </View>
  );
}
const IB = StyleSheet.create({
  root:  { backgroundColor:SURF, borderTopWidth:1.5, paddingTop:8, paddingHorizontal:12 },
  row:   { flexDirection:'row', alignItems:'flex-end', gap:8, borderWidth:1.5, borderRadius:16, paddingHorizontal:12, paddingVertical:9, backgroundColor:BG },
  input: { flex:1, fontFamily:MONO, fontSize:13, color:TEXT, padding:0, maxHeight:110, includeFontPadding:false },
  send:  { width:40, height:40, borderRadius:13, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
});

export default function ButlerScreen() {
  return <TabErrorBoundary name="Butler"><ButlerInner /></TabErrorBoundary>;
}
