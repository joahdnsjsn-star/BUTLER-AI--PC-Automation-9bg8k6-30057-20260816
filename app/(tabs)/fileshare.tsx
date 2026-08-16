
/**
 * BUTLER AI — File Vault v4 · Transfer Redesign
 * Non-scrollable chrome · Upload zone + transfers FlatList
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Animated, Platform, Dimensions, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoClipboard from 'expo-clipboard';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { useFocusEffect } from 'expo-router';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { serverConnection } from '@/services/serverConnection';
import { haptics } from '@/services/haptics';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#111621';
const PURP = '#A468FF';
const CYAN = '#38D9E8';
const GREEN= '#2FE38A';
const AMBER= '#FFB43D';
const RED  = '#FF4D5E';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);

type Transfer = { id:string; name:string; type:'send'|'recv'; size:string; status:'ok'|'err'; ts:number; };

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

const VaultHeader = memo(({ safeTop, isConn }: { safeTop:number; isConn:boolean }) => {
  // ── SKIN WIRING: every colour below resolves from the active pack on the
  // SKINS page, so switching a skin recolours this header instantly. ──
  const S = useSkin();
  const CYAN = S.accent, TEAL = S.accent, BLUE = S.accent2, PURP = S.accent3;
  const AMBER = S.warn, GREEN = S.ok, RED = S.danger;
  const TEXT = S.text, DIM = S.dim, MID = S.mid;
  const SURF = S.panel, SURF2 = S.panel2, SURF3 = S.panel2, BG = S.bg;
  const [hh, setHh] = useState('--:--');
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
      Animated.timing(scanX, { toValue:SW+120, duration:2400, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(6000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  const cc = isConn ? GREEN : AMBER;
  return (
    <View style={[VH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="VH" still={!S.headerGlow} />
      <View style={{ height:3, backgroundColor:PURP }} />
      <Animated.View pointerEvents="none" style={[VH.scan, { transform:[{ translateX:scanX }] }]} />
      <View style={VH.body}>
        <View style={{ flex:1, gap:4 }}>
          <Text style={VH.eye}>PHONE → PC · DIRECT LAN · NO CLOUD</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <MaterialCommunityIcons name="folder-network" size={18} color={PURP} />
            <Text style={VH.title}>FILE <Text style={{ color:PURP }}>VAULT</Text></Text>
          </View>
          <View style={{ flexDirection:'row', gap:6 }}>
            <View style={[VH.pill, { borderColor: PURP+'60', backgroundColor: PURP+'10' }]}>
              <PulseDot color={cc} size={5} />
              <Text style={[VH.pTxt, { color:PURP }]}>{isConn ? 'READY' : 'PAIR PC'}</Text>
            </View>
            <View style={[VH.pill, { borderColor: GREEN+'40', backgroundColor: GREEN+'08' }]}>
              <Text style={[VH.pTxt, { color:GREEN }]}>AES-256</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems:'flex-end', gap:3 }}>
          <Text style={[VH.cBig, { color:TEXT }]}>{hh}</Text>
          <Text style={VH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      <View style={{ height:2, backgroundColor: PURP+'30' }} />
    </View>
  );
});
const VH = StyleSheet.create({
  root: { backgroundColor:'#050810', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor: PURP+'07' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, color: PURP+'60', letterSpacing:1.5, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

function VaultInner() {
  const insets  = useSafeAreaInsets();
  const [isConn, setIsConn] = useState(false);
  const [file, setFile]     = useState<{ name:string; uri:string; size?:number }|null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus]   = useState('');
  const [clip, setClip]       = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const shakeX = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    setIsConn(serverConnection.isConnected?.() ?? false);
  }, []));

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue:8, duration:60, useNativeDriver:true }),
      Animated.timing(shakeX, { toValue:-8, duration:60, useNativeDriver:true }),
      Animated.timing(shakeX, { toValue:4, duration:60, useNativeDriver:true }),
      Animated.timing(shakeX, { toValue:0, duration:60, useNativeDriver:true }),
    ]).start();
  };

  const pickFile = async () => {
    haptics.medium();
    try {
      const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory:true });
      if (!r.canceled && r.assets?.[0]) {
        const a = r.assets[0];
        setFile({ name:a.name, uri:a.uri, size:a.size });
        setStatus('');
      }
    } catch (e:any) { setStatus('Could not pick file: ' + e?.message); }
  };

  const sendFile = async () => {
    if (!file) { shake(); return; }
    if (!isConn) { setStatus('Connect your PC first'); shake(); return; }
    setSending(true); setStatus('Uploading…');
    try {
      const ip  = serverConnection.getIP?.() || '';
      const prt = serverConnection.getPort?.() || '';
      const tok = serverConnection.getToken?.() || '';
      const h: Record<string,string> = {};
      if (tok) h['Authorization'] = 'Bearer ' + tok;
      const fd = new FormData();
      fd.append('file', { uri:file.uri, name:file.name, type:'application/octet-stream' } as any);
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 60000);
      const res  = await fetch(`http://${ip}:${prt}/api/receive_file`, { method:'POST', headers:h, body:fd, signal:ctrl.signal });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const sz = file.size ? (file.size < 1048576 ? `${(file.size/1024).toFixed(1)}KB` : `${(file.size/1048576).toFixed(1)}MB`) : '?';
      setStatus(`Sent ${file.name} ✓`);
      setTransfers(prev => [{ id:Date.now().toString(), name:file.name, type:'send', size:sz, status:'ok', ts:Date.now() }, ...prev]);
      haptics.success(); setFile(null);
    } catch (e:any) {
      const errMsg = e?.name==='AbortError' ? 'Timed out' : (e?.message||'Failed');
      setStatus('Error: ' + errMsg);
    }
    setSending(false);
  };

  const pasteClip = async () => {
    haptics.light();
    try {
      const s = await ExpoClipboard.getStringAsync();
      setClip(s || '');
    } catch {}
  };

  const sendClip = async () => {
    if (!clip.trim() || !isConn) return;
    haptics.medium();
    try {
      const ip  = serverConnection.getIP?.() || '';
      const prt = serverConnection.getPort?.() || '';
      const tok = serverConnection.getToken?.() || '';
      const h: Record<string,string> = { 'Content-Type':'application/json' };
      if (tok) h['Authorization'] = 'Bearer ' + tok;
      await fetch(`http://${ip}:${prt}/api/clipboard`, { method:'POST', headers:h, body: JSON.stringify({ text:clip }) });
      haptics.success();
    } catch {}
  };

  const bytes = file?.size ? (file.size < 1024 ? `${file.size}B` : file.size < 1048576 ? `${(file.size/1024).toFixed(1)}KB` : `${(file.size/1048576).toFixed(1)}MB`) : '';
  const statusColor = status.includes('✓') ? GREEN : status.includes('Error') ? RED : AMBER;

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <VaultHeader safeTop={insets.top} isConn={isConn} />

      {/* Transfer zone */}
      <View style={{ paddingHorizontal:14, paddingTop:14, gap:10 }}>
        {/* File picker */}
        <Animated.View style={{ transform:[{ translateX:shakeX }] }}>
          <TouchableOpacity onPress={pickFile} activeOpacity={0.85}
            style={[FZ.dropZone, { borderColor: file ? PURP+'60' : DIM+'80', backgroundColor: file ? PURP+'08' : DIM+'20' }]}>
            {file ? (
              <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
                <View style={[FZ.fileIcon, { backgroundColor: PURP+'14', borderColor: PURP+'40' }]}>
                  <MaterialCommunityIcons name="file-check-outline" size={22} color={PURP} />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[FZ.fileName, { color:TEXT }]} numberOfLines={1}>{file.name}</Text>
                  {bytes ? <Text style={FZ.fileSize}>{bytes}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => { setFile(null); setStatus(''); }}>
                  <MaterialIcons name="close" size={18} color={RED+'80'} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems:'center', gap:8 }}>
                <MaterialCommunityIcons name="upload-outline" size={32} color={MID} />
                <Text style={FZ.dropTxt}>Tap to select a file</Text>
                <Text style={FZ.dropSub}>Sent directly to PC Desktop folder</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {status ? (
          <View style={{ borderWidth:1, borderRadius:10, padding:10, borderColor: statusColor+'35', backgroundColor: statusColor+'08', flexDirection:'row', alignItems:'center', gap:8 }}>
            <MaterialIcons name={status.includes('✓')?'check-circle':'info'} size={14} color={statusColor} />
            <Text style={{ fontFamily:MONO, fontSize:10, color:statusColor, flex:1 }}>{status}</Text>
            <TouchableOpacity onPress={() => setStatus('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <MaterialIcons name="close" size={12} color={MID} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Send button */}
        <TouchableOpacity onPress={sendFile} disabled={sending} activeOpacity={0.85}
          style={[FZ.sendBtn, { backgroundColor: file && isConn ? PURP : DIM+'50' }]}>
          {sending
            ? <ActivityIndicator size="small" color={file&&isConn?'#000':MID} />
            : <MaterialCommunityIcons name="send-outline" size={16} color={file&&isConn?'#000':MID} />}
          <Text style={[FZ.sendTxt, { color: file&&isConn ? '#000' : MID }]}>
            {sending ? 'SENDING…' : 'SEND TO PC'}
          </Text>
        </TouchableOpacity>

        {/* Clipboard row */}
        <View style={{ flexDirection:'row', gap:8 }}>
          <View style={[FZ.clipInput, { flex:1, borderColor: clip ? CYAN+'50' : DIM+'60' }]}>
            <TextInput value={clip} onChangeText={setClip}
              placeholder="Clipboard text…" placeholderTextColor={MID}
              style={{ flex:1, fontFamily:MONO, fontSize:12, color:TEXT, padding:0, includeFontPadding:false }} />
          </View>
          <TouchableOpacity onPress={pasteClip} activeOpacity={0.8}
            style={[FZ.clipBtn, { borderColor: CYAN+'40', backgroundColor: CYAN+'0C' }]}>
            <MaterialCommunityIcons name="clipboard-arrow-down" size={14} color={CYAN} />
          </TouchableOpacity>
          <TouchableOpacity onPress={sendClip} disabled={!clip.trim()||!isConn} activeOpacity={0.8}
            style={[FZ.clipBtn, { borderColor: GREEN+'40', backgroundColor: GREEN+'0C', opacity: clip.trim()&&isConn ? 1 : 0.4 }]}>
            <MaterialCommunityIcons name="arrow-up-circle-outline" size={14} color={GREEN} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent transfers */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:7, paddingHorizontal:14, paddingTop:14, paddingBottom:8 }}>
        <View style={{ width:3, height:12, borderRadius:2, backgroundColor:PURP }} />
        <Text style={{ fontFamily:MONO, fontSize:9, color: PURP+'90', fontWeight:'900', letterSpacing:1.5 }}>RECENT TRANSFERS</Text>
        <View style={{ flex:1, height:1, backgroundColor: PURP+'20' }} />
      </View>

      <FlatList
        data={transfers}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <View style={{ flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingVertical:9, borderBottomWidth:1, borderBottomColor: DIM+'60' }}>
            <MaterialCommunityIcons name={item.type==='send'?'upload':'download'} size={16} color={item.status==='ok'?GREEN:RED} />
            <Text style={{ fontFamily:MONO, fontSize:11, color:TEXT, flex:1 }} numberOfLines={1}>{item.name}</Text>
            <Text style={{ fontFamily:MONO, fontSize:9, color:MID }}>{item.size}</Text>
            <View style={{ width:6, height:6, borderRadius:3, backgroundColor: item.status==='ok'?GREEN:RED }} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={{ alignItems:'center', paddingTop:30, gap:8 }}>
            <MaterialCommunityIcons name="folder-network-outline" size={36} color={DIM} />
            <Text style={{ fontFamily:MONO, fontSize:11, color:MID }}>No transfers yet</Text>
          </View>
        }
      />

      <View style={{ backgroundColor:SURF, borderTopWidth:1, borderTopColor: DIM+'60', paddingTop:8, paddingBottom:Math.max(insets.bottom+4,10), paddingHorizontal:14 }}>
        <Text style={{ fontFamily:MONO, fontSize:9, color:MID, textAlign:'center' }}>
          PHONE → PC DIRECT · AES-256 · NO CLOUD STORAGE
        </Text>
      </View>
    </View>
  );
}
const FZ = StyleSheet.create({
  dropZone: { borderRadius:14, borderWidth:1.5, borderStyle:'dashed' as any, padding:18, alignItems:'center', justifyContent:'center', minHeight:100 },
  fileIcon: { width:44, height:44, borderRadius:12, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  fileName: { fontSize:14, fontWeight:'700', lineHeight:19 },
  fileSize: { fontFamily:MONO, fontSize:10, color:MID, marginTop:2 },
  dropTxt:  { fontSize:14, fontWeight:'600', color:MID },
  dropSub:  { fontFamily:MONO, fontSize:10, color:MID+'80' },
  sendBtn:  { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:12, paddingVertical:13 },
  sendTxt:  { fontFamily:MONO, fontSize:13, fontWeight:'900' },
  clipInput:{ flexDirection:'row', alignItems:'center', borderWidth:1.5, borderRadius:10, paddingHorizontal:12, paddingVertical:9, backgroundColor:BG },
  clipBtn:  { width:44, height:44, borderWidth:1.5, borderRadius:10, alignItems:'center', justifyContent:'center' },
});

export default function NetOpsScreen() {
  return <TabErrorBoundary name="Vault"><VaultInner /></TabErrorBoundary>;
}

