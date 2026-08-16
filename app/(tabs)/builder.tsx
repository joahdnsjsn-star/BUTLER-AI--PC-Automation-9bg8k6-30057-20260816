/**
 * BUTLER AI — Flow Builder v4 · Build Redesign
 * Non-scrollable chrome · Node palette + pipeline list
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  Animated, Platform, Dimensions,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { haptics } from '@/services/haptics';

const BG   = '#050810';
const SURF = '#0B0F17';
const SURF2= '#111621';
const GREEN= '#2FE38A';
const CYAN = '#38D9E8';
const AMBER= '#FFB43D';
const PURP = '#A468FF';
const BLUE = '#4A9EFF';
const TEAL = '#38D9E8';
const RED  = '#FF4D5E';
const DIM  = '#4A9EFF';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);

const NODE_TYPES = [
  { id:'trigger', label:'TRIGGER',  icon:'lightning-bolt',     color:AMBER },
  { id:'script',  label:'SCRIPT',   icon:'code-braces',        color:CYAN  },
  { id:'condition',label:'IF/ELSE', icon:'source-branch',      color:PURP  },
  { id:'delay',   label:'DELAY',    icon:'timer-outline',      color:BLUE  },
  { id:'notify',  label:'NOTIFY',   icon:'bell-outline',       color:GREEN },
  { id:'output',  label:'OUTPUT',   icon:'export-variant',     color:TEAL  },
];

type FlowNode = { id:string; type:string; label:string; color:string; icon:string; status:'idle'|'running'|'done'|'error'; };

const STARTER_FLOW: FlowNode[] = [
  { id:'n1', type:'trigger', label:'On Boot',              color:AMBER, icon:'lightning-bolt',  status:'done'  },
  { id:'n2', type:'script',  label:'Check Disk Space',     color:CYAN,  icon:'code-braces',     status:'done'  },
  { id:'n3', type:'condition',label:'Disk > 90%?',         color:PURP,  icon:'source-branch',   status:'idle'  },
  { id:'n4', type:'script',  label:'Clean Temp Files',     color:CYAN,  icon:'broom',           status:'idle'  },
  { id:'n5', type:'notify',  label:'Send Notification',    color:GREEN, icon:'bell-outline',    status:'idle'  },
  { id:'n6', type:'output',  label:'Log Result',           color:TEAL,  icon:'export-variant',  status:'idle'  },
];

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

const FlowNodeCard = memo(({ node, index, total }: { node:FlowNode; index:number; total:number }) => {
  const statusColor = node.status==='done' ? GREEN : node.status==='running' ? AMBER : node.status==='error' ? RED : MID;
  const scaleA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleA, { toValue:1, tension:160, friction:12, delay:index*60, useNativeDriver:true }).start();
  }, []);
  return (
    <Animated.View style={{ transform:[{scale:scaleA}] }}>
      <View style={[FN.row, { borderColor: node.color+'30' }]}>
        {/* Left connector line */}
        {index > 0 && <View style={[FN.connLine, { backgroundColor: node.color+'30' }]} />}
        {/* Number */}
        <View style={[FN.numBox, { borderColor: node.color+'50', backgroundColor: node.color+'10' }]}>
          <Text style={[FN.num, { color:node.color }]}>{String(index+1).padStart(2,'0')}</Text>
        </View>
        {/* Icon */}
        <View style={[FN.iconBox, { borderColor: node.color+'50', backgroundColor: node.color+'10' }]}>
          <MaterialCommunityIcons name={node.icon as any} size={18} color={node.color} />
        </View>
        {/* Content */}
        <View style={{ flex:1 }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
            <Text style={[FN.type, { color:node.color }]}>{node.type.toUpperCase()}</Text>
          </View>
          <Text style={FN.label}>{node.label}</Text>
        </View>
        {/* Status */}
        <View style={{ alignItems:'center', gap:4 }}>
          <View style={[FN.status, { borderColor: statusColor+'50', backgroundColor: statusColor+'10' }]}>
            {node.status==='running'
              ? <PulseDot color={statusColor} size={5} />
              : <MaterialIcons name={node.status==='done'?'check':node.status==='error'?'error':'hourglass-empty'} size={10} color={statusColor} />}
          </View>
        </View>
        {/* Arrow to next */}
        {index < total-1 && (
          <View style={[FN.arrow, { backgroundColor: node.color }]} />
        )}
      </View>
    </Animated.View>
  );
});
const FN = StyleSheet.create({
  row:      { backgroundColor:SURF, borderRadius:12, borderWidth:1.5, padding:12, flexDirection:'row', alignItems:'center', gap:10, position:'relative', overflow:'visible', marginBottom:8 },
  connLine: { position:'absolute', top:-8, left:26, width:2, height:8 },
  arrow:    { position:'absolute', bottom:-8, left:26, width:2, height:8, opacity:0.4 },
  numBox:   { width:32, height:32, borderRadius:8, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  num:      { fontFamily:MONO, fontSize:10, fontWeight:'900' },
  iconBox:  { width:38, height:38, borderRadius:10, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  type:     { fontFamily:MONO, fontSize:8, fontWeight:'900', letterSpacing:0.8 },
  label:    { fontFamily:MONO, fontSize:12, color:TEXT, lineHeight:16, marginTop:2 },
  status:   { borderWidth:1, borderRadius:8, paddingHorizontal:6, paddingVertical:4 },
});

function BuilderInner() {
  const insets  = useSafeAreaInsets();
  const [nodes, setNodes]   = useState<FlowNode[]>(STARTER_FLOW);
  const [selType, setSelType] = useState('');
  const [hh, setHh]           = useState('--:--');
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
      Animated.timing(scanX, { toValue:SW+120, duration:2800, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(7000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);

  const addNode = (type: typeof NODE_TYPES[0]) => {
    haptics.medium();
    setSelType(type.id);
    const newNode: FlowNode = {
      id: 'n'+Date.now(), type:type.id,
      label: type.label + ' Node',
      color: type.color, icon: type.icon, status:'idle',
    };
    setNodes(prev => [...prev, newNode]);
  };

  const runFlow = () => {
    haptics.heavy();
    setNodes(prev => prev.map((n,i) => ({ ...n, status: i===0?'done':i===1?'running':'idle' })));
    setTimeout(() => {
      setNodes(prev => prev.map(n => ({ ...n, status:'done' })));
    }, 2000);
  };

  const clearFlow = () => { haptics.medium(); setNodes([]); };

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      {/* Header */}
      <View style={[BH.root, { paddingTop:insets.top }]}>
        <View style={{ height:3, backgroundColor:GREEN }} />
        <Animated.View pointerEvents="none" style={[BH.scan, { transform:[{translateX:scanX}] }]} />
        <View style={BH.body}>
          <View style={{ flex:1, gap:4 }}>
            <Text style={BH.eye}>PIPELINE EDITOR · DRAG-DROP FLOWS</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <MaterialCommunityIcons name="hammer-screwdriver" size={18} color={GREEN} />
              <Text style={BH.title}>FLOW <Text style={{ color:GREEN }}>BUILDER</Text></Text>
            </View>
            <View style={{ flexDirection:'row', gap:6 }}>
              <View style={[BH.pill, { borderColor: GREEN+'60', backgroundColor: GREEN+'10' }]}>
                <PulseDot color={GREEN} size={5} />
                <Text style={[BH.pTxt, { color:GREEN }]}>{nodes.length} NODES</Text>
              </View>
            </View>
          </View>
          <View style={{ alignItems:'flex-end', gap:3 }}>
            <Text style={[BH.cBig, { color:TEXT }]}>{hh}</Text>
            <Text style={BH.cSub}>LOCAL · SECURE</Text>
          </View>
        </View>
        <View style={{ height:2, backgroundColor: GREEN+'30' }} />
      </View>

      {/* Node palette */}
      <View style={{ backgroundColor:SURF, borderBottomWidth:1, borderBottomColor: DIM+'80', paddingVertical:10 }}>
        <Text style={{ fontFamily:MONO, fontSize:8.5, color: GREEN+'70', letterSpacing:1.5, paddingHorizontal:14, marginBottom:8, fontWeight:'900' }}>
          + ADD NODE
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, gap:8 }}>
          {NODE_TYPES.map(t => (
            <TouchableOpacity key={t.id} onPress={() => addNode(t)} activeOpacity={0.8}
              style={{ alignItems:'center', gap:6, borderWidth:1.5, borderRadius:12, paddingHorizontal:12, paddingVertical:9,
                borderColor: t.color+'50', backgroundColor: t.color+'0C' }}>
              <MaterialCommunityIcons name={t.icon as any} size={18} color={t.color} />
              <Text style={{ fontFamily:MONO, fontSize:8, fontWeight:'900', color:t.color }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Flow nodes */}
      <FlatList
        data={nodes}
        keyExtractor={n => n.id}
        renderItem={({ item, index }) => <FlowNodeCard node={item} index={index} total={nodes.length} />}
        contentContainerStyle={{ padding:14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems:'center', paddingTop:60, gap:12 }}>
            <MaterialCommunityIcons name="hammer-screwdriver" size={48} color={DIM} />
            <Text style={{ fontFamily:MONO, fontSize:12, color:MID }}>No nodes yet</Text>
            <Text style={{ fontFamily:MONO, fontSize:10, color:MID+'80', textAlign:'center' }}>
              Tap + ADD NODE above to build your flow
            </Text>
          </View>
        }
      />

      {/* Action bar */}
      <View style={{ flexDirection:'row', gap:10, paddingHorizontal:14, paddingTop:10, paddingBottom:Math.max(insets.bottom+8,14),
        borderTopWidth:1, borderTopColor: DIM+'80', backgroundColor:SURF }}>
        <TouchableOpacity onPress={clearFlow} activeOpacity={0.8}
          style={{ borderWidth:1.5, borderRadius:12, paddingVertical:12, paddingHorizontal:16, borderColor: RED+'40', backgroundColor: RED+'09' }}>
          <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:RED }}>CLEAR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptics.medium(); }} activeOpacity={0.8}
          style={{ borderWidth:1.5, borderRadius:12, paddingVertical:12, paddingHorizontal:16, borderColor: BLUE+'40', backgroundColor: BLUE+'09' }}>
          <Text style={{ fontFamily:MONO, fontSize:11, fontWeight:'900', color:BLUE }}>SAVE</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={runFlow} activeOpacity={0.85}
          style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:12, paddingVertical:12, backgroundColor: GREEN }}>
          <MaterialIcons name="play-arrow" size={18} color="#000" />
          <Text style={{ fontFamily:MONO, fontSize:13, fontWeight:'900', color:'#000' }}>RUN FLOW</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const BH = StyleSheet.create({
  root: { backgroundColor:'#050810', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor: GREEN+'07' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, color: GREEN+'60', letterSpacing:1.5, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

export default function BuilderScreen() {
  return <TabErrorBoundary name="Builder"><BuilderInner /></TabErrorBoundary>;
}
