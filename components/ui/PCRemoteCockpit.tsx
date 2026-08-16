/**
 * PC Remote Cockpit
 * 4 panels: Clipboard Bridge · Quick Type · Power Control · Process Manager
 * All endpoints already implemented server-side — zero new server code needed.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Platform, Alert,
  ActivityIndicator, FlatList,
} from 'react-native';
import { safeSetClipboard, safeGetClipboard } from '@/services/safeClipboard';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { serverConnection } from '@/services/serverConnection';
import { haptics } from '@/services/haptics';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const C = {
  bg:      '#050810',
  surface: '#0B0F17',
  surfHi:  '#4A9EFF',
  cyan:    '#38D9E8',
  good:    '#2FE38A',
  amber:   '#FFB43D',
  danger:  '#FF4D5E',
  purple:  '#A468FF',
  text:    '#DCE6F2',
  textMid: '#4A9EFF',
  textDim: '#4A9EFF',
  border:  'rgba(0,229,255,0.18)',
};

interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
}

// ─── PANEL HEADER ─────────────────────────────────────────────────
function PanelHeader({ icon, label, color, right }: { icon: string; label: string; color: string; right?: React.ReactNode }) {
  return (
    <View style={[ph.row, { borderBottomColor: color + '25' }]}>
      <View style={[ph.iconBox, { backgroundColor: color + '18', borderColor: color + '45' }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[ph.label, { color }]}>{label}</Text>
      {right}
    </View>
  );
}
const ph = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, marginBottom: 12 },
  iconBox: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 11, fontWeight: '900', fontFamily: MONO, letterSpacing: 1.4, flex: 1 },
});

// ─── CLIPBOARD BRIDGE ────────────────────────────────────────────
function ClipboardBridge({ connected }: { connected: boolean }) {
  const [pcClip,    setPcClip]    = useState('');
  const [phoneClip, setPhoneClip] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [status,    setStatus]    = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const flash = (msg: string, isError = false) => {
    setStatus(msg);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.delay(1800),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => setStatus(''));
  };

  const readPC = useCallback(async () => {
    if (!connected) { flash('Connect PC first', true); return; }
    setLoading(true);
    haptics.light();
    try {
      const res = await serverConnection.fetchWithAuth('/api/clipboard', { method: 'POST', body: JSON.stringify({}) });
      const d = await res.json();
      const text = d.text || d.content || '';
      setPcClip(text);
      if (text) flash('PC clipboard read ✓');
      else flash('PC clipboard is empty');
    } catch (e: any) {
      flash('Failed: ' + e.message, true);
    } finally { setLoading(false); }
  }, [connected]);

  const writePC = useCallback(async () => {
    if (!connected) { flash('Connect PC first', true); return; }
    if (!phoneClip.trim()) { flash('Nothing to send', true); return; }
    setLoading(true);
    haptics.medium();
    try {
      const res = await serverConnection.fetchWithAuth('/api/clipboard', {
        method: 'POST',
        body: JSON.stringify({ text: phoneClip }),
      });
      const d = await res.json();
      if (d.status === 'ok' || d.success) flash('Sent to PC clipboard ✓');
      else flash(d.error || 'Failed', true);
    } catch (e: any) {
      flash('Failed: ' + e.message, true);
    } finally { setLoading(false); }
  }, [connected, phoneClip]);

  const copyFromPC = () => {
    if (!pcClip) return;
    try { safeSetClipboard(pcClip); } catch {}
    haptics.light();
    flash('Copied to phone ✓');
  };

  const readPhone = useCallback(async () => {
    try { const t = await safeGetClipboard(); setPhoneClip(t || ''); haptics.light(); } catch {}
  }, []);

  return (
    <View style={pnl.card}>
      <PanelHeader icon="content-copy" label="CLIPBOARD BRIDGE" color={C.cyan} />
      {/* PC Clipboard row */}
      <View style={cb.row}>
        <View style={cb.label}><MaterialIcons name="computer" size={11} color={C.cyan} /><Text style={[cb.labelTxt, { color: C.cyan }]}>PC</Text></View>
        <View style={cb.valueBox}>
          <Text style={cb.value} numberOfLines={2}>{pcClip || '—'}</Text>
        </View>
        <TouchableOpacity onPress={copyFromPC} disabled={!pcClip} style={[cb.btn, { opacity: pcClip ? 1 : 0.35 }]} activeOpacity={0.8}>
          <MaterialIcons name="phone-android" size={13} color={C.cyan} />
        </TouchableOpacity>
        <TouchableOpacity onPress={readPC} disabled={loading} style={cb.readBtn} activeOpacity={0.8}>
          {loading ? <ActivityIndicator size={12} color="#000" /> : <Text style={cb.readTxt}>READ</Text>}
        </TouchableOpacity>
      </View>
      {/* Phone Clipboard row */}
      <View style={[cb.row, { marginTop: 8 }]}>
        <View style={cb.label}><MaterialIcons name="phone-android" size={11} color={C.purple} /><Text style={[cb.labelTxt, { color: C.purple }]}>PHONE</Text></View>
        <TextInput
          style={cb.input}
          value={phoneClip}
          onChangeText={setPhoneClip}
          placeholder="Type or paste..."
          placeholderTextColor={C.textDim}
          multiline={false}
        />
        <TouchableOpacity onPress={readPhone} style={[cb.btn, { borderColor: C.purple + '60', backgroundColor: C.purple + '12' }]} activeOpacity={0.8}>
          <MaterialIcons name="content-paste" size={13} color={C.purple} />
        </TouchableOpacity>
        <TouchableOpacity onPress={writePC} disabled={loading || !phoneClip.trim()} style={[cb.sendBtn, { opacity: loading || !phoneClip.trim() ? 0.4 : 1 }]} activeOpacity={0.8}>
          <MaterialIcons name="send" size={12} color="#000" />
          <Text style={cb.sendTxt}>SEND</Text>
        </TouchableOpacity>
      </View>
      {/* Status bar */}
      <Animated.View style={[cb.statusBar, { opacity: fadeAnim }]}>
        <MaterialIcons name={status.includes('✓') ? 'check-circle' : 'info'} size={11} color={status.includes('✓') ? C.good : C.amber} />
        <Text style={[cb.statusTxt, { color: status.includes('✓') ? C.good : C.amber }]}>{status}</Text>
      </Animated.View>
    </View>
  );
}
const cb = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label:    { flexDirection: 'row', alignItems: 'center', gap: 3, width: 50, flexShrink: 0 },
  labelTxt: { fontSize: 8, fontWeight: '900', fontFamily: MONO, letterSpacing: 0.5 },
  valueBox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 6, minHeight: 32 },
  value:    { fontSize: 10, fontFamily: MONO, color: C.text, lineHeight: 14 },
  input:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 6, fontSize: 10, fontFamily: MONO, color: C.text, minHeight: 32 },
  btn:      { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.cyan + '50', backgroundColor: C.cyan + '10', alignItems: 'center', justifyContent: 'center' },
  readBtn:  { height: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.cyan, alignItems: 'center', justifyContent: 'center' },
  readTxt:  { fontSize: 9, fontWeight: '900', fontFamily: MONO, color: '#000', letterSpacing: 0.5 },
  sendBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3, height: 32, paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.purple },
  sendTxt:  { fontSize: 9, fontWeight: '900', fontFamily: MONO, color: '#000', letterSpacing: 0.5 },
  statusBar:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 4 },
  statusTxt:{ fontSize: 9, fontFamily: MONO },
});

// ─── QUICK TYPE ──────────────────────────────────────────────────
function QuickType({ connected }: { connected: boolean }) {
  const [text,    setText]    = useState('');
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const flash = (msg: string) => {
    setStatus(msg);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
      Animated.delay(2000),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => setStatus(''));
  };

  const send = useCallback(async (textToSend = text) => {
    if (!connected) { flash('Connect PC first'); return; }
    if (!textToSend.trim()) { flash('Enter text first'); return; }
    setLoading(true);
    haptics.medium();
    try {
      const res = await serverConnection.fetchWithAuth('/api/keyboard/type', {
        method: 'POST',
        body: JSON.stringify({ text: textToSend }),
      });
      const d = await res.json();
      if (d.status === 'ok' || d.success || d.typed) {
        flash('Typed on PC ✓');
        setRecents(prev => [textToSend, ...prev.filter(r => r !== textToSend)].slice(0, 6));
        setText('');
      } else {
        flash(d.error || 'Failed — is pyautogui installed?');
      }
    } catch (e: any) {
      flash('Error: ' + e.message);
    } finally { setLoading(false); }
  }, [connected, text]);

  return (
    <View style={pnl.card}>
      <PanelHeader icon="keyboard" label="QUICK TYPE → PC" color={C.amber}
        right={<Text style={{ fontSize: 8, fontFamily: MONO, color: C.textDim }}>Types into focused window</Text>}
      />
      <View style={qt.inputRow}>
        <TextInput
          style={qt.input}
          value={text}
          onChangeText={setText}
          placeholder="Type text to inject on PC..."
          placeholderTextColor={C.textDim}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          multiline={false}
        />
        <TouchableOpacity onPress={() => send()} disabled={loading || !text.trim()}
          style={[qt.sendBtn, { opacity: loading || !text.trim() ? 0.4 : 1 }]} activeOpacity={0.8}>
          {loading ? <ActivityIndicator size={13} color="#000" /> : (
            <><MaterialIcons name="keyboard-return" size={14} color="#000" /><Text style={qt.sendTxt}>INJECT</Text></>
          )}
        </TouchableOpacity>
      </View>
      {/* Recents */}
      {recents.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 1 }}>
          {recents.map((r, i) => (
            <TouchableOpacity key={i} onPress={() => { setText(r); haptics.light(); }}
              style={qt.chip} activeOpacity={0.8}>
              <Text style={qt.chipTxt} numberOfLines={1}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <Animated.View style={[cb.statusBar, { opacity: fadeAnim }]}>
        <MaterialIcons name={status.includes('✓') ? 'check-circle' : 'warning'} size={11} color={status.includes('✓') ? C.good : C.amber} />
        <Text style={[cb.statusTxt, { color: status.includes('✓') ? C.good : C.amber }]}>{status}</Text>
      </Animated.View>
    </View>
  );
}
const qt = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: MONO, color: C.text },
  sendBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, height: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.amber },
  sendTxt:  { fontSize: 10, fontWeight: '900', fontFamily: MONO, color: '#000', letterSpacing: 0.8 },
  chip:     { borderWidth: 1, borderRadius: 8, borderColor: C.amber + '45', backgroundColor: C.amber + '0C', paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt:  { fontSize: 9, fontFamily: MONO, color: C.amber, maxWidth: 140 },
});

// ─── POWER CONTROL ──────────────────────────────────────────────
type PowerAction = 'sleep' | 'restart' | 'shutdown';
interface PowerBtn { action: PowerAction; icon: string; label: string; color: string; dangerous: boolean }

const POWER_BTNS: PowerBtn[] = [
  { action: 'sleep',    icon: 'bedtime',       label: 'SLEEP',    color: C.cyan,   dangerous: false },
  { action: 'restart',  icon: 'restart-alt',   label: 'RESTART',  color: C.amber,  dangerous: false },
  { action: 'shutdown', icon: 'power-settings-new', label: 'SHUTDOWN', color: C.danger, dangerous: true  },
];

function PowerControl({ connected }: { connected: boolean }) {
  const [confirm, setConfirm] = useState<PowerAction | null>(null);
  const [slideX,  setSlideX]  = useState(0);
  const [loading, setLoading] = useState<PowerAction | null>(null);
  const [status,  setStatus]  = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideRef  = useRef<PowerAction | null>(null);

  const flash = (msg: string, good = false) => {
    setStatus(msg);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.delay(2200),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => setStatus(''));
  };

  const execute = useCallback(async (action: PowerAction) => {
    if (!connected) { flash('Connect PC first'); return; }
    setLoading(action);
    haptics.heavy();
    try {
      const res = await serverConnection.fetchWithAuth('/api/power', {
        method: 'POST',
        body: JSON.stringify({ action, confirm: true }),
      });
      const d = await res.json();
      if (d.status === 'ok' || d.success || d.initiated) {
        flash(`${action} command sent ✓`, true);
      } else {
        flash(d.error || 'Failed — enable power_actions_enabled in server settings');
      }
    } catch (e: any) {
      flash('Error: ' + e.message);
    } finally {
      setLoading(null);
      setConfirm(null);
      slideAnim.setValue(0);
      setSlideX(0);
    }
  }, [connected]);

  const onTap = (btn: PowerBtn) => {
    haptics.light();
    if (!connected) { flash('Connect PC first'); return; }
    if (btn.dangerous) {
      setConfirm(btn.action);
      slideAnim.setValue(0);
    } else {
      // Non-dangerous: simple confirm alert
      execute(btn.action);
    }
  };

  return (
    <View style={pnl.card}>
      <PanelHeader icon="power-settings-new" label="POWER CONTROL" color={C.danger} />
      <View style={pw.grid}>
        {POWER_BTNS.map(btn => {
          const isLoading = loading === btn.action;
          return (
            <TouchableOpacity key={btn.action} onPress={() => onTap(btn)}
              disabled={!!loading} style={[pw.btn, { borderColor: btn.color + '50', backgroundColor: btn.color + '0E' }]}
              activeOpacity={0.8}>
              {isLoading
                ? <ActivityIndicator size={18} color={btn.color} />
                : <MaterialIcons name={btn.icon as any} size={22} color={btn.color} />
              }
              <Text style={[pw.btnTxt, { color: btn.color }]}>{btn.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Slide-to-confirm for dangerous actions */}
      {confirm && (
        <View style={pw.confirmWrap}>
          <Text style={pw.confirmTitle}>⚠ CONFIRM {confirm.toUpperCase()}</Text>
          <View style={pw.track}>
            <Text style={pw.trackHint}>→ SLIDE TO CONFIRM</Text>
            <Animated.View
              style={[pw.thumb, { transform: [{ translateX: slideAnim }] }]}
              {...{
                onStartShouldSetResponder: () => true,
                onResponderMove: (e: any) => {
                  const x = Math.max(0, Math.min(e.nativeEvent.pageX - 30, 200));
                  slideAnim.setValue(x);
                  setSlideX(x);
                },
                onResponderRelease: () => {
                  if (slideX >= 160) {
                    execute(confirm!);
                  } else {
                    Animated.spring(slideAnim, { toValue: 0, tension: 200, friction: 12, useNativeDriver: false }).start();
                    setSlideX(0);
                  }
                },
              } as any}
            >
              <MaterialIcons name="chevron-right" size={18} color="#000" />
            </Animated.View>
          </View>
          <TouchableOpacity onPress={() => { setConfirm(null); slideAnim.setValue(0); }} style={pw.cancelBtn} activeOpacity={0.8}>
            <Text style={pw.cancelTxt}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}
      <Animated.View style={[cb.statusBar, { opacity: fadeAnim }]}>
        <MaterialIcons name={status.includes('✓') ? 'check-circle' : 'info'} size={11} color={status.includes('✓') ? C.good : C.amber} />
        <Text style={[cb.statusTxt, { color: status.includes('✓') ? C.good : C.amber }]}>{status}</Text>
      </Animated.View>
    </View>
  );
}
const pw = StyleSheet.create({
  grid:        { flexDirection: 'row', gap: 8 },
  btn:         { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center', gap: 6, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 }, android: { elevation: 4 } }) },
  btnTxt:      { fontSize: 9, fontWeight: '900', fontFamily: MONO, letterSpacing: 0.8 },
  confirmWrap: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.danger + '50', backgroundColor: C.danger + '08' },
  confirmTitle:{ fontSize: 11, fontWeight: '900', fontFamily: MONO, color: C.danger, textAlign: 'center', marginBottom: 10, letterSpacing: 1 },
  track:       { height: 44, borderRadius: 22, backgroundColor: 'rgba(255,49,49,0.1)', borderWidth: 1.5, borderColor: C.danger + '40', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden', position: 'relative' },
  trackHint:   { fontFamily: MONO, fontSize: 10, color: C.danger + '50', fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  thumb:       { position: 'absolute', left: 4, width: 36, height: 36, borderRadius: 18, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', ...Platform.select({ ios: { shadowColor: C.danger, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 }, android: { elevation: 8 } }) },
  cancelBtn:   { marginTop: 8, alignItems: 'center', paddingVertical: 7 },
  cancelTxt:   { fontSize: 10, fontWeight: '700', fontFamily: MONO, color: C.textMid, letterSpacing: 0.8 },
});

// ─── PROCESS MANAGER ────────────────────────────────────────────
function ProcessManager({ connected }: { connected: boolean }) {
  const [procs,    setProcs]    = useState<Process[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [killing,  setKilling]  = useState<number | null>(null);
  const [status,   setStatus]   = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const flash = (msg: string) => {
    setStatus(msg);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
      Animated.delay(2000),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => setStatus(''));
  };

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    haptics.light();
    try {
      const res = await serverConnection.fetchWithAuth('/api/processes');
      const d = await res.json();
      const list: Process[] = (d.processes || d.data || [])
        .sort((a: Process, b: Process) => (b.cpu_percent || 0) - (a.cpu_percent || 0))
        .slice(0, 12);
      setProcs(list);
    } catch {}
    setLoading(false);
  }, [connected]);

  useEffect(() => { if (connected) load(); }, [connected]);

  const kill = useCallback(async (pid: number, name: string) => {
    haptics.heavy();
    setKilling(pid);
    try {
      const res = await serverConnection.fetchWithAuth('/api/kill_process', {
        method: 'POST',
        body: JSON.stringify({ pid }),
      });
      const d = await res.json();
      if (d.status === 'ok' || d.success || d.killed) {
        flash(`Killed ${name} (${pid}) ✓`);
        setProcs(prev => prev.filter(p => p.pid !== pid));
      } else {
        flash(d.error || 'Failed to kill process');
      }
    } catch (e: any) {
      flash('Error: ' + e.message);
    }
    setKilling(null);
  }, []);

  const cpuColor = (pct: number) => pct > 40 ? C.danger : pct > 15 ? C.amber : C.good;

  return (
    <View style={pnl.card}>
      <PanelHeader icon="memory" label="PROCESS MANAGER" color={C.purple}
        right={
          <TouchableOpacity onPress={load} disabled={loading || !connected}
            style={[pm.refreshBtn, { opacity: loading || !connected ? 0.35 : 1 }]} activeOpacity={0.8}>
            {loading ? <ActivityIndicator size={12} color={C.purple} /> : <MaterialIcons name="refresh" size={14} color={C.purple} />}
          </TouchableOpacity>
        }
      />
      {!connected && (
        <View style={pm.offlineNote}>
          <MaterialIcons name="computer" size={14} color={C.textDim} />
          <Text style={pm.offlineTxt}>Connect your PC to view live processes</Text>
        </View>
      )}
      {connected && procs.length === 0 && !loading && (
        <TouchableOpacity onPress={load} style={pm.loadBtn} activeOpacity={0.8}>
          <MaterialIcons name="play-arrow" size={14} color={C.purple} />
          <Text style={[pm.loadTxt, { color: C.purple }]}>LOAD PROCESSES</Text>
        </TouchableOpacity>
      )}
      {procs.map((p, i) => {
        const col = cpuColor(p.cpu_percent);
        return (
          <View key={p.pid} style={[pm.row, { borderBottomColor: i < procs.length - 1 ? 'rgba(0,229,255,0.08)' : 'transparent' }]}>
            <View style={pm.nameCpu}>
              <Text style={pm.name} numberOfLines={1}>{p.name}</Text>
              <View style={pm.barTrack}>
                <View style={[pm.barFill, { width: `${Math.min(100, p.cpu_percent)}%` as any, backgroundColor: col }]} />
              </View>
            </View>
            <Text style={[pm.cpu, { color: col }]}>{p.cpu_percent.toFixed(1)}%</Text>
            <Text style={pm.pid}>{p.pid}</Text>
            <TouchableOpacity onPress={() => kill(p.pid, p.name)} disabled={killing === p.pid}
              style={[pm.killBtn, { opacity: killing === p.pid ? 0.4 : 1 }]} activeOpacity={0.8}>
              {killing === p.pid
                ? <ActivityIndicator size={10} color={C.danger} />
                : <MaterialIcons name="close" size={12} color={C.danger} />
              }
            </TouchableOpacity>
          </View>
        );
      })}
      <Animated.View style={[cb.statusBar, { opacity: fadeAnim }]}>
        <MaterialIcons name={status.includes('✓') ? 'check-circle' : 'info'} size={11} color={status.includes('✓') ? C.good : C.amber} />
        <Text style={[cb.statusTxt, { color: status.includes('✓') ? C.good : C.amber }]}>{status}</Text>
      </Animated.View>
    </View>
  );
}
const pm = StyleSheet.create({
  refreshBtn:  { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: C.purple + '40', backgroundColor: C.purple + '10', alignItems: 'center', justifyContent: 'center' },
  offlineNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
  offlineTxt:  { fontSize: 10, fontFamily: MONO, color: C.textDim },
  loadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 10, borderColor: C.purple + '35', backgroundColor: C.purple + '08' },
  loadTxt:     { fontSize: 10, fontWeight: '900', fontFamily: MONO, letterSpacing: 0.8 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  nameCpu:     { flex: 1, gap: 3 },
  name:        { fontSize: 10, fontFamily: MONO, color: C.text, fontWeight: '600' },
  barTrack:    { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill:     { height: '100%' as any, borderRadius: 2 },
  cpu:         { fontSize: 10, fontWeight: '900', fontFamily: MONO, width: 40, textAlign: 'right' },
  pid:         { fontSize: 8, fontFamily: MONO, color: C.textDim, width: 36, textAlign: 'right' },
  killBtn:     { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: C.danger + '40', backgroundColor: C.danger + '0C', alignItems: 'center', justifyContent: 'center' },
});

// ─── PANEL WRAPPER ───────────────────────────────────────────────
const pnl = StyleSheet.create({
  card: {
    borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.18)',
    backgroundColor: '#0B0F17', padding: 14, marginBottom: 12,
    ...Platform.select({ ios: { shadowColor: '#38D9E8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14 }, android: { elevation: 6 } }),
  },
});

// ─── MAIN EXPORT ────────────────────────────────────────────────
export function PCRemoteCockpit({ connected }: { connected: boolean }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View>
      {/* Section Header */}
      <View style={rc.sectionHeader}>
        <View style={rc.headerLeft}>
          <View style={[rc.dot, { backgroundColor: connected ? C.good : C.danger }]}>
            <Animated.View style={[rc.dotPulse, { backgroundColor: connected ? C.good : C.danger, opacity: pulseAnim }]} />
          </View>
          <Text style={rc.sectionTitle}>PC REMOTE COCKPIT</Text>
        </View>
        <View style={[rc.badge, { borderColor: (connected ? C.good : C.danger) + '55', backgroundColor: (connected ? C.good : C.danger) + '0D' }]}>
          <Text style={[rc.badgeTxt, { color: connected ? C.good : C.danger }]}>{connected ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
      </View>
      <Text style={rc.sectionSub}>Clipboard · Keystroke injection · Power · Processes</Text>

      <ClipboardBridge connected={connected} />
      <QuickType connected={connected} />
      <PowerControl connected={connected} />
      <ProcessManager connected={connected} />
    </View>
  );
}

const rc = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, marginTop: 8 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:           { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  dotPulse:      { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  sectionTitle:  { fontSize: 14, fontWeight: '900', fontFamily: MONO, color: '#FFFFFF', letterSpacing: 1.5 },
  sectionSub:    { fontSize: 9, fontFamily: MONO, color: C.textDim, letterSpacing: 0.5, marginBottom: 14 },
  badge:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:      { fontSize: 9, fontWeight: '900', fontFamily: MONO, letterSpacing: 1 },
});
