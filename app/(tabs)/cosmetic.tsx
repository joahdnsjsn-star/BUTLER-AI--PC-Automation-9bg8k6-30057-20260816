/**
 * BUTLER AI — Cosmetic / Skins v4 · Theme Redesign
 * Non-scrollable chrome · Theme grid FlatList
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Platform, Dimensions,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { haptics } from '@/services/haptics';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#111621';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);
const CARD_W = (SW - 32 - 8) / 2;

type Theme = { id:string; name:string; sub:string; accent:string; bg:string; preview:string[]; };

const THEMES: Theme[] = [
  { id:'nexus',   name:'NEXUS DARK',     sub:'Default · Cyan & Navy',    accent:'#38D9E8', bg:'#0B0F17', preview:['#0B0F17','#0B0F17','#38D9E8','#2FE38A'] },
  { id:'quantum', name:'QUANTUM AMBER',  sub:'Warm glow · Gold & Black', accent:'#FFB43D', bg:'#050810', preview:['#050810','#050810','#FFB43D','#FF7A1F'] },
  { id:'sigma',   name:'SIGMA PURPLE',   sub:'Neural · Violet & Deep',   accent:'#A468FF', bg:'#050810', preview:['#050810','#0B0F17','#A468FF','#4A9EFF'] },
  { id:'matrix',  name:'MATRIX GREEN',   sub:'Terminal · Green on Black', accent:'#2FE38A', bg:'#050810', preview:['#050810','#050810','#2FE38A','#38D9E8'] },
  { id:'steel',   name:'STEEL BLUE',     sub:'Industrial · Blue & Grey',  accent:'#4A9EFF', bg:'#050810', preview:['#050810','#0B0F17','#4A9EFF','#38D9E8'] },
  { id:'lava',    name:'LAVA RED',        sub:'Danger · Red & Obsidian',   accent:'#FF4D5E', bg:'#050810', preview:['#050810','#070A10','#FF4D5E','#FFB43D'] },
  { id:'teal',    name:'TEAL CYBER',     sub:'Clean · Teal & Midnight',   accent:'#38D9E8', bg:'#050810', preview:['#050810','#070A10','#38D9E8','#38D9E8'] },
  { id:'phantom', name:'PHANTOM',        sub:'Stealth · White on Black',  accent:'#DCE6F2', bg:'#050810', preview:['#050810','#050810','#DCE6F2','#6B7A92'] },
];

const PulseDot = memo(({ color, size=6 }: { color:string; size?:number }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue:1, duration:800, useNativeDriver:true }),
      Animated.timing(a, { toValue:0.2, duration:800, useNativeDriver:true }),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  return <Animated.View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:color, opacity:a }} />;
});

const ThemeCard = memo(({ theme, active, onSelect }: { theme:Theme; active:boolean; onSelect:()=>void }) => {
  const scaleA = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scaleA, { toValue:0.93, duration:70, useNativeDriver:true }),
      Animated.spring(scaleA, { toValue:1, tension:280, friction:10, useNativeDriver:true }),
    ]).start();
  };
  return (
    <Animated.View style={[TC.card, { borderColor: active ? theme.accent+'80' : DIM+'80', borderWidth: active?2:1.5, transform:[{scale:scaleA}] }]}>
      <TouchableOpacity onPressIn={press} onPress={onSelect} activeOpacity={0.88} style={{ flex:1 }}>
        {/* Color strip */}
        <View style={{ flexDirection:'row', height:6, borderTopLeftRadius:10, borderTopRightRadius:10, overflow:'hidden' }}>
          {theme.preview.map((c,i) => (
            <View key={i} style={{ flex:1, backgroundColor:c }} />
          ))}
        </View>
        {/* Preview area */}
        <View style={[TC.preview, { backgroundColor:theme.bg }]}>
          <View style={[TC.previewCard, { backgroundColor: theme.preview[1], borderColor: theme.accent+'40' }]}>
            <View style={{ width:20, height:3, borderRadius:2, backgroundColor: theme.accent, marginBottom:4 }} />
            <View style={{ width:14, height:2, borderRadius:1, backgroundColor: theme.accent+'50' }} />
          </View>
          <View style={[TC.previewCard, { backgroundColor: theme.preview[1], borderColor: theme.preview[2]+'40' }]}>
            <View style={{ width:16, height:3, borderRadius:2, backgroundColor: theme.preview[2], marginBottom:4 }} />
            <View style={{ width:10, height:2, borderRadius:1, backgroundColor: theme.preview[2]+'50' }} />
          </View>
        </View>
        {/* Info */}
        <View style={{ padding:10, gap:3 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
            <View style={{ width:8, height:8, borderRadius:4, backgroundColor: theme.accent }} />
            <Text style={[TC.name, { color:TEXT }]}>{theme.name}</Text>
            {active && <MaterialIcons name="check-circle" size={12} color={theme.accent} />}
          </View>
          <Text style={TC.sub}>{theme.sub}</Text>
        </View>
        {active && (
          <View style={[TC.activeBadge, { backgroundColor: theme.accent+'20', borderColor: theme.accent+'50' }]}>
            <Text style={[TC.activeTxt, { color:theme.accent }]}>ACTIVE</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});
const TC = StyleSheet.create({
  card:        { width:CARD_W, backgroundColor:SURF, borderRadius:12, overflow:'hidden',
    ...Platform.select({ ios:{shadowColor:'#000',shadowOffset:{width:0,height:3},shadowOpacity:0.4,shadowRadius:8}, android:{elevation:4} }) },
  preview:     { height:64, flexDirection:'row', gap:6, padding:8, alignItems:'center', justifyContent:'center' },
  previewCard: { flex:1, height:48, borderRadius:8, borderWidth:1, padding:8, justifyContent:'center' },
  name:        { fontFamily:MONO, fontSize:10, fontWeight:'900', flex:1, lineHeight:14 },
  sub:         { fontFamily:MONO, fontSize:8, color:MID, lineHeight:11 },
  activeBadge: { position:'absolute', top:8, right:8, borderWidth:1, borderRadius:6, paddingHorizontal:6, paddingVertical:2 },
  activeTxt:   { fontFamily:MONO, fontSize:7.5, fontWeight:'900' },
});

function CosmeticInner() {
  const insets  = useSafeAreaInsets();
  const [active, setActive] = useState('nexus');
  const [hh, setHh]         = useState('--:--');
  const scanX = useRef(new Animated.Value(-SW)).current;
  const ACCENT = THEMES.find(t => t.id===active)?.accent || '#38D9E8';

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setHh(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanX, { toValue:SW+120, duration:2600, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(6500),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  const selectTheme = (id: string) => {
    haptics.success(); setActive(id);
  };

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      {/* Header */}
      <View style={[SH.root, { paddingTop:insets.top }]}>
        <View style={{ height:3, backgroundColor:ACCENT }} />
        <Animated.View pointerEvents="none" style={[SH.scan, { transform:[{translateX:scanX}] }]} />
        <View style={SH.body}>
          <View style={{ flex:1, gap:4 }}>
            <Text style={[SH.eye, { color: ACCENT+'60' }]}>VISUAL SKIN · COLOR PALETTE</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <MaterialCommunityIcons name="palette-swatch" size={18} color={ACCENT} />
              <Text style={SH.title}>COSMETIC <Text style={{ color:ACCENT }}>SKINS</Text></Text>
            </View>
            <View style={{ flexDirection:'row', gap:6 }}>
              <View style={[SH.pill, { borderColor: ACCENT+'60', backgroundColor: ACCENT+'10' }]}>
                <PulseDot color={ACCENT} size={5} />
                <Text style={[SH.pTxt, { color:ACCENT }]}>{THEMES.find(t=>t.id===active)?.name}</Text>
              </View>
            </View>
          </View>
          <View style={{ alignItems:'flex-end', gap:3 }}>
            <Text style={[SH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={SH.cSub}>LOCAL · SECURE</Text>
          </View>
        </View>
        <View style={{ height:2, backgroundColor: ACCENT+'30' }} />
      </View>

      {/* Live color preview bar */}
      <View style={{ height:8, flexDirection:'row' }}>
        {THEMES.find(t=>t.id===active)?.preview.map((c,i) => (
          <View key={i} style={{ flex:1, backgroundColor:c }} />
        ))}
      </View>

      {/* Theme grid */}
      <FlatList
        data={THEMES}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <ThemeCard theme={item} active={active===item.id} onSelect={() => selectTheme(item.id)} />
        )}
        numColumns={2}
        contentContainerStyle={{ padding:12, gap:8, paddingBottom: insets.bottom + 80 }}
        columnWrapperStyle={{ gap:8 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={{ fontFamily:MONO, fontSize:9, color:MID, textAlign:'center', paddingBottom:8, letterSpacing:1.5 }}>
            TAP A THEME TO APPLY · {THEMES.length} SKINS AVAILABLE
          </Text>
        }
      />

      <View style={{ backgroundColor:SURF, borderTopWidth:1, borderTopColor: DIM+'60', paddingTop:8, paddingBottom:Math.max(insets.bottom+4,10), paddingHorizontal:14,
        flexDirection:'row', alignItems:'center', gap:8 }}>
        <View style={{ width:10, height:10, borderRadius:5, backgroundColor:ACCENT }} />
        <Text style={{ fontFamily:MONO, fontSize:9, color:MID, flex:1 }}>ACTIVE: {THEMES.find(t=>t.id===active)?.name}</Text>
        <TouchableOpacity onPress={() => { haptics.heavy(); }} activeOpacity={0.85}
          style={{ borderWidth:1.5, borderRadius:20, paddingHorizontal:14, paddingVertical:6, borderColor: ACCENT+'60', backgroundColor: ACCENT+'12' }}>
          <Text style={{ fontFamily:MONO, fontSize:10, fontWeight:'900', color:ACCENT }}>APPLY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const SH = StyleSheet.create({
  root: { backgroundColor:'#050810', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor:'rgba(255,255,255,0.03)' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, letterSpacing:1.5, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

export default function CosmeticScreen() {
  return <TabErrorBoundary name="Cosmetic"><CosmeticInner /></TabErrorBoundary>;
}
