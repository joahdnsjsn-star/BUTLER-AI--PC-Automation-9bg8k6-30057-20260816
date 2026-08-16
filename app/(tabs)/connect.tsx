/**
 * BUTLER AI — PC Bridge / Connect v5 · Pair Redesign
 * Non-scrollable · QR focus · Status display
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, Platform, Dimensions, KeyboardAvoidingView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { haptics } from '@/services/haptics';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#111621';
const TEAL = '#38D9E8';
const CYAN = '#38D9E8';
const GREEN= '#2FE38A';
const AMBER= '#FFB43D';
const RED  = '#FF4D5E';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);

const PulseDot = memo(({ color, size = 6 }: { color:string; size?:number }) => {
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

// Animated QR target frame
const QRFrame = memo(({ isConn }: { isConn:boolean }) => {
  const scanA = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const s = Animated.loop(Animated.sequence([
      Animated.timing(scanA, { toValue:1, duration:2000, useNativeDriver:true }),
      Animated.timing(scanA, { toValue:0, duration:0, useNativeDriver:true }),
      Animated.delay(600),
    ]));
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue:1, duration:900, useNativeDriver:true }),
      Animated.timing(pulse, { toValue:0.3, duration:900, useNativeDriver:true }),
    ]));
    s.start(); p.start(); return () => { s.stop(); p.stop(); };
  }, []);
  const scanY = scanA.interpolate({ inputRange:[0,1], outputRange:[0,170] });
  const color = isConn ? GREEN : TEAL;
  const SIZE  = 200;
  const CORNER = 24;
  return (
    <View style={[QF.outer, { borderColor: color+'30', backgroundColor: color+'05' }]}>
      {/* HUD corners */}
      {[{ top:0,left:0,bt:2.5,bl:2.5 },{ top:0,right:0,bt:2.5,br:2.5 },{ bottom:0,left:0,bb:2.5,bl:2.5 },{ bottom:0,right:0,bb:2.5,br:2.5 }].map((c:any,i) => (
        <View key={i} style={[{ position:'absolute', width:CORNER, height:CORNER, borderColor:color },
          c.top!==undefined&&{ top:0 }, c.bottom!==undefined&&{ bottom:0 },
          c.left!==undefined&&{ left:0 }, c.right!==undefined&&{ right:0 },
          c.bt&&{ borderTopWidth:c.bt }, c.bb&&{ borderBottomWidth:c.bb },
          c.bl&&{ borderLeftWidth:c.bl }, c.br&&{ borderRightWidth:c.br },
        ]} />
      ))}
      {/* Scan line */}
      <Animated.View pointerEvents="none" style={[QF.scanLine, { backgroundColor: color, transform:[{ translateY:scanY }] }]} />
      {/* Center icon */}
      <Animated.View style={{ opacity: pulse }}>
        {isConn ? (
          <View style={{ alignItems:'center', gap:10 }}>
            <MaterialCommunityIcons name="check-decagram" size={56} color={GREEN} />
            <Text style={[QF.statusTxt, { color:GREEN }]}>PAIRED</Text>
          </View>
        ) : (
          <View style={{ alignItems:'center', gap:10 }}>
            <MaterialCommunityIcons name="qrcode-scan" size={56} color={TEAL} />
            <Text style={[QF.statusTxt, { color:TEAL }]}>SCAN QR</Text>
          </View>
        )}
      </Animated.View>
      {/* Corner dots */}
      {[{ top:10,left:10 },{ top:10,right:10 },{ bottom:10,left:10 },{ bottom:10,right:10 }].map((pos:any,i) => (
        <View key={i} style={[{ position:'absolute', width:6, height:6, borderRadius:3, backgroundColor: color+'60' }, pos]} />
      ))}
    </View>
  );
});
const QF = StyleSheet.create({
  outer:     { width:200, height:200, alignItems:'center', justifyContent:'center', borderRadius:16, borderWidth:1.5, overflow:'hidden', position:'relative', alignSelf:'center' },
  scanLine:  { position:'absolute', left:0, right:0, height:2, opacity:0.6 },
  statusTxt: { fontFamily:MONO, fontSize:14, fontWeight:'900', letterSpacing:2 },
});

// Security model row
const SecurityRow = memo(({ isConn }: { isConn:boolean }) => {
  const items = [
    { label:'LAN only',          sub:'No cloud relay',      color:GREEN },
    { label:'HMAC tokens',       sub:'SHA-256 signed',      color:TEAL  },
    { label:'X-App-Sig',         sub:'Identity check',      color:CYAN  },
    { label:'AES-128-GCM',       sub:'Key derived per-PC',  color:AMBER },
  ];
  return (
    <View style={[SR.root, { borderColor: TEAL+'30' }]}>
      <View style={{ flexDirection:'row', alignItems:'center', gap:7, marginBottom:10 }}>
        <MaterialCommunityIcons name="shield-lock-outline" size={12} color={TEAL} />
        <Text style={{ fontFamily:MONO, fontSize:9, color: TEAL+'90', fontWeight:'900', letterSpacing:1.5 }}>SECURITY MODEL</Text>
      </View>
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
        {items.map((it,i) => (
          <View key={i} style={[SR.cell, { borderColor: it.color+'35', backgroundColor: it.color+'08' }]}>
            <Text style={[SR.label, { color:it.color }]}>{it.label}</Text>
            <Text style={SR.sub}>{it.sub}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});
const SR = StyleSheet.create({
  root:  { borderWidth:1.5, borderRadius:14, padding:14, backgroundColor: SURF2 },
  cell:  { flex:1, minWidth:'44%', borderWidth:1.5, borderRadius:10, padding:10 },
  label: { fontFamily:MONO, fontSize:12, fontWeight:'900', lineHeight:16 },
  sub:   { fontFamily:MONO, fontSize:9, color:MID, marginTop:2 },
});

function ConnectInner() {
  const insets  = useSafeAreaInsets();
  const [isConn, setIsConn]   = useState(false);
  const [ip, setIp]           = useState('');
  const [status, setStatus]   = useState('');
  const [busy, setBusy]       = useState(false);
  const [mode, setMode]       = useState<'qr'|'manual'>('qr');
  const [hh, setHh]           = useState('--:--');
  // Whether the active connection is using plain HTTP (not HTTPS).
  // butler_server.py serves plain HTTP by default, so warn users on open/untrusted networks.
  const [httpWarning, setHttpWarning] = useState(false);
  const scanX = useRef(new Animated.Value(-SW)).current;

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setHh(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue:SW+120, duration:2200, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(5000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  useFocusEffect(useCallback(() => {
    const connected = serverConnection.isConnected?.() ?? false;
    setIsConn(connected);
    // Show HTTP warning if connected over plain HTTP (no TLS).
    // butler_server.py defaults to plain HTTP — only safe on a trusted LAN.
    if (connected) {
      const port = serverConnection.getPort?.() || '';
      const knownHttpsPorts = ['443', '8443', '9443'];
      setHttpWarning(!knownHttpsPorts.includes(port));
    } else {
      setHttpWarning(false);
    }
  }, []));

  const openQR = async () => {
    haptics.heavy();
    try {
      // Try to import and open QR scanner
      const { router } = await import('expo-router');
      // Open QR tab or show camera
      Alert.alert(
        'SCAN QR TO PAIR',
        'Run butler_server.py on your PC.\nA QR code will appear in the terminal.\n\nPoint your camera at it to pair instantly.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'OPEN SCANNER',
            onPress: () => {
              try { (global as any).__nexusHomeOpenQR?.(); } catch {}
            }
          }
        ]
      );
    } catch {}
  };

  const connect = async () => {
    if (!ip.trim()) { setStatus('Enter IP address'); return; }
    setBusy(true); setStatus(`Connecting to ${ip.trim()}…`);
    try {
      const r: any = await serverConnection.connectManual(ip.trim(), '8766');
      if (r?.success) { setIsConn(true); setStatus('Connected!'); haptics.success(); }
      else throw new Error(r?.error || 'Failed');
    } catch (e: any) { setStatus('Error: ' + (e?.message || 'Failed')); }
    setBusy(false);
  };

  const disconnect = () => {
    haptics.medium();
    try { (serverConnection as any).disconnect?.(); } catch {}
    setIsConn(false); setStatus('Disconnected'); setHttpWarning(false);
  };

  const cc = isConn ? GREEN : TEAL;

  return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor:BG }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[CH.root, { paddingTop:insets.top }]}>
        <View style={{ height:3, backgroundColor: TEAL }} />
        <Animated.View pointerEvents="none" style={[CH.scan, { transform:[{ translateX:scanX }] }]} />
        <View style={CH.body}>
          <View style={{ flex:1, gap:4 }}>
            <Text style={CH.eye}>AWAITING HANDSHAKE · LAN BRIDGE</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <MaterialCommunityIcons name="server-network" size={18} color={TEAL} />
              <Text style={CH.title}>PC <Text style={{ color:TEAL }}>BRIDGE</Text></Text>
            </View>
            <View style={[CH.statusRow, { borderColor: cc+'60', backgroundColor: cc+'10' }]}>
              <PulseDot color={cc} size={7} />
              <Text style={[CH.statusTxt, { color:cc }]}>{isConn ? 'PAIRED' : 'UNPAIRED'}</Text>
            </View>
          </View>
          <View style={{ alignItems:'flex-end', gap:3 }}>
            <Text style={[CH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={CH.cSub}>LOCAL · SECURE</Text>
          </View>
        </View>
        <View style={{ height:2, backgroundColor: TEAL+'30' }} />
      </View>

      {/* HTTP warning — shown when paired over plain HTTP (not HTTPS) */}
      {isConn && httpWarning && (
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:9,
          backgroundColor: AMBER+'12', borderBottomWidth:1.5, borderBottomColor: AMBER+'40' }}>
          <MaterialIcons name="warning" size={14} color={AMBER} />
          <Text style={{ fontFamily:MONO, fontSize:9, color:AMBER, flex:1, lineHeight:14 }}>
            {'PLAIN HTTP · No TLS — safe on a trusted home LAN, but avoid connecting over public/office WiFi without HTTPS enabled on butler_server.py.'}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={{ flex:1, paddingHorizontal:16, paddingTop:20, gap:16 }}>
        {/* Mode toggle */}
        <View style={{ flexDirection:'row', gap:8 }}>
          {(['qr','manual'] as const).map(m => (
            <TouchableOpacity key={m} onPress={() => { haptics.light(); setMode(m); }} activeOpacity={0.8}
              style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:11,
                borderWidth:1.5, borderRadius:12,
                borderColor: mode===m ? TEAL+'70' : DIM+'80',
                backgroundColor: mode===m ? TEAL+'15' : DIM+'30' }}>
              <MaterialIcons name={m==='qr'?'qr-code-scanner':'wifi'} size={14} color={mode===m?TEAL:MID} />
              <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:mode===m?TEAL:MID }}>
                {m === 'qr' ? 'QR SCAN' : 'MANUAL IP'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* QR or Manual */}
        {mode === 'qr' ? (
          <View style={{ alignItems:'center', gap:16 }}>
            <Text style={{ fontFamily:MONO, fontSize:9, color: MID, letterSpacing:1, textAlign:'center' }}>
              RUN butler_server.py ON YOUR PC · POINT CAMERA AT QR
            </Text>
            <QRFrame isConn={isConn} />
            <TouchableOpacity onPress={isConn ? disconnect : openQR} activeOpacity={0.85}
              style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:14, paddingHorizontal:28,
                backgroundColor: isConn ? RED : TEAL, borderRadius:16, alignSelf:'stretch', justifyContent:'center' }}>
              <MaterialIcons name={isConn ? 'link-off' : 'qr-code-scanner'} size={20} color="#000" />
              <Text style={{ fontFamily:MONO, fontSize:14, fontWeight:'900', color:'#000' }}>
                {isConn ? 'DISCONNECT' : 'SCAN QR CODE'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap:12 }}>
            <Text style={{ fontFamily:MONO, fontSize:9, color:MID, letterSpacing:1 }}>
              ENTER PC IP ADDRESS FROM BUTLER SERVER TERMINAL
            </Text>
            <View style={[CH.ipRow, { borderColor: ip ? TEAL+'60' : DIM+'60' }]}>
              <MaterialCommunityIcons name="ip-network-outline" size={16} color={MID} />
              <TextInput value={ip} onChangeText={setIp}
                placeholder="192.168.x.x" placeholderTextColor={MID}
                style={CH.input} keyboardType="numeric" autoCorrect={false} />
            </View>
            {status ? (
              <View style={{ borderWidth:1, borderRadius:10, padding:10,
                borderColor: (status.includes('Connected')?GREEN:status.includes('Error')?RED:AMBER)+'45',
                backgroundColor: (status.includes('Connected')?GREEN:status.includes('Error')?RED:AMBER)+'08' }}>
                <Text style={{ fontFamily:MONO, fontSize:11, color: status.includes('Connected')?GREEN:status.includes('Error')?RED:AMBER }}>
                  {status}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={isConn ? disconnect : connect} disabled={busy} activeOpacity={0.85}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
                paddingVertical:14, backgroundColor: isConn ? RED : GREEN, borderRadius:16 }}>
              {busy ? <ActivityIndicator size="small" color="#000" /> : <MaterialIcons name={isConn?'link-off':'link'} size={20} color="#000" />}
              <Text style={{ fontFamily:MONO, fontSize:14, fontWeight:'900', color:'#000' }}>
                {busy ? 'CONNECTING…' : isConn ? 'DISCONNECT' : 'CONNECT'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <SecurityRow isConn={isConn} />
      </View>

      <View style={{ paddingHorizontal:16, paddingBottom: Math.max(insets.bottom+8, 16), paddingTop:10,
        borderTopWidth:1, borderTopColor: DIM+'60', backgroundColor: SURF }}>
        <Text style={{ fontFamily:MONO, fontSize:9, color:MID, textAlign:'center', letterSpacing:1 }}>
          LAN ONLY · AES-256 · HMAC-SHA256 · ZERO CLOUD · ZERO TELEMETRY
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
const CH = StyleSheet.create({
  root:      { backgroundColor:'#050810', overflow:'hidden' },
  scan:      { position:'absolute', top:0, bottom:0, width:80, backgroundColor: TEAL+'07' },
  body:      { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:       { fontFamily:MONO, fontSize:7.5, color: TEAL+'60', letterSpacing:1.5, fontWeight:'700' },
  title:     { fontSize:22, fontWeight:'900', color:'#FFF' },
  statusRow: { flexDirection:'row', alignItems:'center', gap:6, borderWidth:1.5, borderRadius:20, paddingHorizontal:10, paddingVertical:5, alignSelf:'flex-start' },
  statusTxt: { fontFamily:MONO, fontSize:10, fontWeight:'900' },
  cBig:      { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSub:      { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
  ipRow:     { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1.5, borderRadius:12, paddingHorizontal:14, paddingVertical:12, backgroundColor:BG },
  input:     { flex:1, fontFamily:MONO, fontSize:15, color:TEXT, padding:0, includeFontPadding:false },
});

export default function PairPCScreen() {
  return <TabErrorBoundary name="Connect"><ConnectInner /></TabErrorBoundary>;
}
