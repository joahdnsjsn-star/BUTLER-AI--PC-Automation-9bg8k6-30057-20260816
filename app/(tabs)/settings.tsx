// guard-scan:allow-html-string — buildHtmlIDE() emits a standalone browser page.
/**
 * BUTLER AI — Settings v6 · VS Code IDE Export
 * Full codebase HTML IDE export with edit/AI prompt generation
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Platform, Dimensions, Alert, Linking, ScrollView, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkin } from '@/hooks/useSkin';
import { SkinHeaderFX } from '@/components/ui/SkinHeaderFX';
import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptics } from '@/services/haptics';
import { askButler, listOllamaModels } from '@/services/butlerAsk';
import * as ExpoClipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';

const BG   = '#050810';
const SURF = '#070A10';
const SURF2= '#0B0F17';
const CYAN = '#38D9E8';
const GREEN= '#2FE38A';
const AMBER= '#FFB43D';
const RED  = '#FF4D5E';
const PURP = '#A468FF';
const BLUE = '#4A9EFF';
const DIM  = '#111621';
const MID  = '#4A9EFF';
const TEXT = '#DCE6F2';
const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SW   = Math.max(320, Dimensions.get('window').width);

type SettingItem =
  | { type:'header'; label:string; color:string }
  | { type:'toggle'; label:string; sub:string; icon:string; color:string; key:string }
  | { type:'action'; label:string; sub:string; icon:string; color:string; action:string; danger?:boolean }
  | { type:'info';   label:string; sub:string; icon:string; color:string }
  | { type:'link';   label:string; sub:string; icon:string; color:string; url:string };

const SETTINGS: SettingItem[] = [
  { type:'header', label:'CONNECTION', color:CYAN },
  { type:'action', label:'Pair PC via QR',          sub:'Scan QR from butler_server.py',    icon:'qr-code-scanner', color:CYAN,  action:'pair' },
  { type:'action', label:'Manual IP Entry',          sub:'Connect by IP address + port',     icon:'wifi',           color:BLUE,  action:'manual' },
  { type:'action', label:'Forget Paired PC',         sub:'Remove stored credentials',        icon:'link-off',       color:AMBER, action:'forget' },

  { type:'header', label:'AI ENGINE', color:PURP },
  { type:'action', label:'Check Ollama Status',      sub:'Verify local AI model is running', icon:'robot-happy',    color:PURP,  action:'ollama' },
  { type:'action', label:'Pull Best Model',           sub:'Download qwen2.5-coder:7b',        icon:'download',       color:CYAN,  action:'pull' },

  { type:'header', label:'PRIVACY & DATA', color:GREEN },
  { type:'info',   label:'Telemetry',                sub:'Zero telemetry — nothing sent',    icon:'analytics',      color:GREEN },
  { type:'info',   label:'Cloud Storage',            sub:'Zero cloud — all data local',       icon:'cloud-off',      color:GREEN },
  { type:'action', label:'Clear Chat History',       sub:'Delete all chat sessions',          icon:'delete-sweep',   color:AMBER, action:'clearChat' },
  { type:'action', label:'Delete All My Data',        sub:'GDPR wipe — irreversible',          icon:'delete-forever', color:RED,   action:'deleteAll', danger:true },

  { type:'header', label:'CODEBASE IDE', color:PURP },
  { type:'action', label:'Export Codebase IDE',      sub:'VS Code-style HTML to view+edit all source', icon:'code', color:PURP, action:'exportHtml' },
  { type:'action', label:'Cache Tab Sources',        sub:'Visit all tabs to cache their source code',  icon:'sync',  color:CYAN, action:'cacheAll' },
  { type:'action', label:'Copy All Source',          sub:'All cached source → clipboard for AI',       icon:'content-copy', color:AMBER, action:'copySource' },

  { type:'header', label:'SYNC & UPDATES', color:BLUE },
  { type:'action', label:'Open GitHub Repo',         sub:'Download latest butler_server.py', icon:'code-tags',      color:CYAN,  action:'github' },
  { type:'link',   label:'Privacy Policy',           sub:'View full privacy document',        icon:'shield',         color:GREEN, url:'https://shawnjan-cmd.github.io/privacy-policy-/' },
  { type:'link',   label:'Terms of Service',         sub:'Read full terms',                   icon:'gavel',          color:AMBER, url:'https://shawnjan-cmd.github.io/privacy-policy-/#terms-of-service' },

  { type:'header', label:'ABOUT', color:MID },
  { type:'info',   label:'Butler AI',                sub:'v7.3.0 · com.butlerai.pc.automation', icon:'information', color:CYAN },
  { type:'info',   label:'Security',                 sub:'AES-256-GCM · HMAC-SHA256 · LAN only', icon:'lock',       color:GREEN },
  { type:'info',   label:'© 2026 Andrej Sladkovic', sub:'All rights reserved · Proprietary',    icon:'copyright',   color:MID },
];

// ─── Pulse dot ──────────────────────────────────────────────────
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

// ─── Header ─────────────────────────────────────────────────────
const ConfigHeader = memo(({ safeTop }: { safeTop:number }) => {
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
      Animated.timing(scanX, { toValue:SW+120, duration:3000, useNativeDriver:true }),
      Animated.timing(scanX, { toValue:-SW, duration:0, useNativeDriver:true }),
      Animated.delay(8000),
    ]));
    loop.start(); return () => loop.stop();
  }, []);
  // ── SKIN WIRING: every colour below resolves from the active pack on the
  // SKINS page, so switching a skin recolours this header instantly. ──
  const S = useSkin();
  const CYAN = S.accent, TEAL = S.accent, BLUE = S.accent2, PURP = S.accent3;
  const AMBER = S.warn, GREEN = S.ok, RED = S.danger;
  const TEXT = S.text, DIM = S.dim, MID = S.mid;
  const SURF = S.panel, SURF2 = S.panel2, SURF3 = S.panel2, BG = S.bg;
  return (
    <View style={[CH.root, { paddingTop: safeTop, backgroundColor: S.headerBg, borderBottomColor: S.border }]}>
          <SkinHeaderFX accent={S.accent} accent2={S.accent2} accent3={S.accent3} stripe={S.stripe} fxKey="CH" still={!S.headerGlow} />
      <View style={{ height:3, backgroundColor:CYAN }} />
      <Animated.View pointerEvents="none" style={[CH.scan, { transform:[{translateX:scanX}] }]} />
      <View style={CH.body}>
        <View style={{ flex:1, gap:4 }}>
          <Text style={CH.eye}>SYSTEM PREFERENCES · LOCAL CONFIG</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={CYAN} />
            <Text style={CH.title}>SYSTEM <Text style={{ color:CYAN }}>CONFIG</Text></Text>
          </View>
          <View style={{ flexDirection:'row', gap:6 }}>
            <View style={[CH.pill, { borderColor: GREEN+'60', backgroundColor: GREEN+'10' }]}>
              <PulseDot color={GREEN} size={5} />
              <Text style={[CH.pTxt, { color:GREEN }]}>ZERO TELEMETRY</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems:'flex-end', gap:3 }}>
          <Text style={[CH.cBig, { color:TEXT }]}>{hh}</Text>
          <Text style={CH.cSub}>LOCAL · SECURE</Text>
        </View>
      </View>
      <View style={{ height:2, backgroundColor: CYAN+'30' }} />
    </View>
  );
});
const CH = StyleSheet.create({
  root: { backgroundColor:'#050810', overflow:'hidden' },
  scan: { position:'absolute', top:0, bottom:0, width:80, backgroundColor: CYAN+'06' },
  body: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingTop:11, paddingBottom:12, gap:10, zIndex:1 },
  eye:  { fontFamily:MONO, fontSize:7.5, color: CYAN+'60', letterSpacing:1.5, fontWeight:'700' },
  title:{ fontSize:22, fontWeight:'900', color:'#FFF' },
  pill: { flexDirection:'row', alignItems:'center', gap:5, borderWidth:1.5, borderRadius:20, paddingHorizontal:9, paddingVertical:4 },
  pTxt: { fontFamily:MONO, fontSize:9, fontWeight:'900' },
  cBig: { fontFamily:MONO, fontSize:22, fontWeight:'900', letterSpacing:1 },
  cSub: { fontFamily:MONO, fontSize:7, color:MID, letterSpacing:1 },
});

// ─── VS Code-style IDE HTML builder ────────────────────────────
function buildHtmlIDE(files: {path:string; source:string}[]): string {
  const ts = new Date().toISOString();
  const BT = String.fromCharCode(96);
  const sourcesJson = JSON.stringify(
    files.reduce((acc, f) => { (acc as any)[f.path] = f.source || ''; return acc; }, {})
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Butler AI — Codebase IDE</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;background:#0B0F17;color:#DCE6F2;font-family:Menlo,Consolas,monospace;font-size:13px}
#app{display:flex;flex-direction:column;height:100vh}
#topbar{display:flex;align-items:center;gap:10px;padding:9px 16px;background:#4A9EFF;border-bottom:1px solid #2A3242;flex-shrink:0;z-index:100;flex-wrap:wrap}
#main{display:flex;flex:1;overflow:hidden}
#sidebar{width:230px;background:#4A9EFF;border-right:1px solid #2A3242;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column}
#sidebar-header{padding:9px 12px;font-size:9px;font-weight:900;color:#38D9E8;letter-spacing:2px;border-bottom:1px solid #2A3242;display:flex;align-items:center;gap:7px}
.file-item{padding:6px 12px;cursor:pointer;border-bottom:1px solid #1D2432;display:flex;align-items:flex-start;gap:8px;transition:background .12s}
.file-item:hover{background:#1D2432}
.file-item.active{background:#4A9EFF;border-left:2.5px solid #38D9E8}
.fi-icon{font-size:11px;min-width:16px;padding-top:1px}
.fi-name{font-size:11px;font-weight:700;color:#6B7A92}
.fi-path{font-size:9px;color:#3A4356;word-break:break-all;margin-top:1px}
.fi-meta{font-size:8px;color:#4A9EFF;margin-top:2px}
.file-item.cached .fi-name{color:#38D9E8}
.file-item.edited .fi-name{color:#FFB43D}
.file-item.edited::after{content:'M';font-size:8px;color:#FFB43D;font-weight:900;margin-left:auto;margin-top:2px;flex-shrink:0}
.cat-label{padding:5px 12px 2px;font-size:8px;color:#4A9EFF;font-weight:900;letter-spacing:1.5px;border-top:1px solid #1D2432}
#editor-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
#editor-toolbar{padding:7px 12px;background:#4A9EFF;border-bottom:1px solid #2A3242;display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}
#tb-path{font-size:10px;color:#6B7A92;flex:1;min-width:100px}
.tb-btn{background:#1D2432;color:#DCE6F2;border:1px solid #2A3242;border-radius:6px;padding:5px 10px;font-size:10px;font-weight:700;cursor:pointer;font-family:Menlo,monospace}
.tb-btn:hover{background:#2A3242}
.tb-btn.primary{background:#2FE38A;color:#fff;border-color:#2FE38A}
.tb-btn.danger{background:#FF4D5E;color:#fff;border-color:#FF4D5E}
.tb-btn.accent{background:#4A9EFF;color:#fff;border-color:#4A9EFF}
.tb-btn.amber{background:#FFC94A;color:#fff;border-color:#FFC94A}
#code-view{flex:1;overflow:auto;background:#0B0F17;display:flex}
#line-nums{padding:14px 10px 14px 12px;background:#0B0F17;color:#3A4356;font-size:12px;line-height:1.6;text-align:right;user-select:none;border-right:1px solid #1D2432;min-width:42px;flex-shrink:0}
#code-body{flex:1;padding:14px 16px;font-size:12px;line-height:1.6;white-space:pre;overflow-x:auto;color:#DCE6F2;tab-size:2}
#edit-panel{background:#4A9EFF;border-top:2px solid #4A9EFF;flex-shrink:0;display:none;flex-direction:column;height:44vh}
#edit-panel.open{display:flex}
#edit-hdr{padding:7px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #2A3242;background:#4A9EFF}
.eh-title{font-size:11px;font-weight:900;color:#4A9EFF;flex:1}
#edit-ta{flex:1;background:#0B0F17;color:#DCE6F2;border:none;padding:14px;font-family:Menlo,monospace;font-size:12px;line-height:1.6;resize:none;outline:none}
#prompt-panel{background:#0B0F17;border-top:1px solid #1D2432;flex-shrink:0;display:none;max-height:180px;overflow:auto;padding:12px}
#prompt-panel.open{display:block}
#prompt-text{font-size:11px;line-height:1.6;color:#2FE38A;white-space:pre-wrap;word-break:break-word}
#paste-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:999;align-items:center;justify-content:center}
#paste-overlay.open{display:flex}
#paste-dialog{background:#4A9EFF;border:1px solid #2A3242;border-radius:14px;padding:24px;width:min(700px,94vw);display:flex;flex-direction:column;gap:12px;max-height:90vh;overflow-y:auto}
#paste-dialog h2{font-size:15px;font-weight:900;color:#38D9E8}
#paste-dialog p{font-size:10px;color:#6B7A92;line-height:1.7}
#paste-ta{height:280px;background:#0B0F17;border:1px solid #2A3242;border-radius:8px;padding:12px;color:#DCE6F2;font-family:Menlo,monospace;font-size:11px;resize:none;width:100%}
#paste-ta:focus{outline:none;border-color:#4A9EFF}
#paste-path{background:#0B0F17;border:1px solid #2A3242;border-radius:8px;padding:8px 12px;color:#DCE6F2;font-family:Menlo,monospace;font-size:12px;width:100%}
#paste-path:focus{outline:none;border-color:#38D9E8}
.dlg-btns{display:flex;gap:8px;justify-content:flex-end}
.dlg-btns button{padding:8px 18px;border-radius:8px;font-weight:900;font-size:12px;cursor:pointer;font-family:Menlo,monospace}
.btn-cancel{background:#1D2432;color:#6B7A92;border:1px solid #2A3242}
.btn-save{background:#2FE38A;color:#fff;border:none}
#logo{font-size:14px;font-weight:900;color:#38D9E8;letter-spacing:1px;white-space:nowrap}
#search-inp{background:#1D2432;border:1px solid #2A3242;border-radius:8px;padding:6px 12px;color:#DCE6F2;font-family:Menlo,monospace;font-size:12px;width:220px}
#search-inp:focus{outline:none;border-color:#4A9EFF}
.top-btn{background:#1D2432;color:#DCE6F2;border:1px solid #2A3242;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:Menlo,monospace;white-space:nowrap}
.top-btn:hover{background:#2A3242}
.top-btn.green{background:#2FE38A;color:#fff;border-color:#2FE38A}
.top-btn.blue{background:#4A9EFF;color:#fff;border-color:#4A9EFF}
.top-btn.purp{background:#A468FF;color:#fff;border-color:#A468FF}
#status{font-size:9px;color:#3A4356;margin-left:auto;white-space:nowrap}
.kw{color:#FF4D5E}.str{color:#4A9EFF}.cmt{color:#6B7A92;font-style:italic}.num{color:#FFC94A}.type{color:#2FE38A}.jsx{color:#4A9EFF}.sh{background:#ffb02030;border-radius:2px}
#welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;color:#6B7A92;text-align:center}
#welcome h2{font-size:18px;font-weight:900;color:#DCE6F2}
#welcome p{font-size:12px;line-height:1.8;max-width:520px}
.wstep{background:#4A9EFF;border:1px solid #2A3242;border-radius:12px;padding:14px 18px;text-align:left;width:100%;max-width:520px}
.wstep-num{font-size:8px;color:#4A9EFF;font-weight:900;letter-spacing:1px;margin-bottom:3px}
.wstep-txt{font-size:11px;color:#DCE6F2;line-height:1.7}
</style>
</head>
<body>
<div id="app">
<div id="topbar">
  <span id="logo">&#9001; BUTLER AI IDE</span>
  <input id="search-inp" type="text" placeholder="Search all files... (Ctrl+F)" oninput="doSearch(this.value)" />
  <button class="top-btn" onclick="openPasteDialog()">+ PASTE FILE</button>
  <button class="top-btn blue" onclick="copyAllForAI()">COPY ALL FOR AI</button>
  <button class="top-btn purp" onclick="copySelectedPrompt()">GEN AI PROMPT</button>
  <button class="top-btn green" onclick="exportAllFiles()">EXPORT ALL</button>
  <span id="status">Butler AI v7.3 &middot; ${files.length} files &middot; ${ts}</span>
</div>
<div id="main">
<div id="sidebar">
  <div id="sidebar-header"><span>&#9113;</span> SOURCE FILES</div>
  <div id="file-list"></div>
</div>
<div id="editor-area">
  <div id="editor-toolbar">
    <span id="tb-path">Select a file &rarr;</span>
    <button class="tb-btn" onclick="copyCurrentFile()">COPY</button>
    <button class="tb-btn accent" onclick="openEdit()">EDIT</button>
    <button class="tb-btn" onclick="closeEdit()">VIEW</button>
    <button class="tb-btn primary" onclick="saveEdit()">SAVE</button>
    <button class="tb-btn danger" onclick="revertFile()">REVERT</button>
    <button class="tb-btn amber" onclick="genPrompt()">PROMPT</button>
  </div>
  <div id="code-view">
    <div id="line-nums"></div>
    <div id="code-body"></div>
  </div>
  <div id="edit-panel">
    <div id="edit-hdr">
      <span class="eh-title">EDIT MODE</span>
      <span style="font-size:9px;color:#6B7A92">Ctrl+S to save &middot; edited files marked M in sidebar</span>
      <button class="tb-btn" style="margin-left:8px" onclick="closeEdit()">CLOSE</button>
    </div>
    <textarea id="edit-ta" spellcheck="false" placeholder="Select a file and click EDIT..."></textarea>
  </div>
  <div id="prompt-panel">
    <div id="prompt-text"></div>
  </div>
  <div id="welcome">
    <h2>Butler AI Codebase IDE</h2>
    <p>View, search, and edit every source file. Generate precise AI prompts to apply changes in OnSpace without wasting credits.</p>
    <div class="wstep"><div class="wstep-num">STEP 1 — LOAD SOURCE</div><div class="wstep-txt">Cyan files are cached and ready. For empty files: open OnSpace Code View (&lt;&gt; top-right) &rarr; copy file &rarr; click + PASTE FILE below.</div></div>
    <div class="wstep"><div class="wstep-num">STEP 2 — EDIT CODE</div><div class="wstep-txt">Select any file &rarr; click EDIT &rarr; modify the code &rarr; SAVE. Changed files are marked M.</div></div>
    <div class="wstep"><div class="wstep-num">STEP 3 — APPLY WITH AI</div><div class="wstep-txt">Click PROMPT to generate a diff-style AI message. Copy it and paste into OnSpace AI chat. Applies only your exact changes, minimum credits.</div></div>
    <div class="wstep"><div class="wstep-num">COPY ALL FOR AI</div><div class="wstep-txt">Click COPY ALL FOR AI to copy every cached file concatenated with headers. Paste into Claude, ChatGPT, or any AI to give it full codebase context.</div></div>
  </div>
</div>
</div>
</div>
<div id="paste-overlay" onclick="overlayClick(event)">
  <div id="paste-dialog">
    <h2>+ PASTE SOURCE FILE</h2>
    <p>Open OnSpace Code View (top-right &lt;&gt; button) &rarr; select a file &rarr; copy all content &rarr; paste below.<br>All pasted sources are saved in your browser's localStorage.</p>
    <input id="paste-path" type="text" placeholder="File path: e.g. app/(tabs)/home.tsx" />
    <textarea id="paste-ta" spellcheck="false" placeholder="Paste complete TypeScript source here..."></textarea>
    <div class="dlg-btns">
      <button class="btn-cancel" onclick="closePaste()">CANCEL</button>
      <button class="btn-save" onclick="confirmPaste()">SAVE FILE</button>
    </div>
  </div>
</div>
<script>
var EMBEDDED=${sourcesJson};
var ALL_FILES=[
  {path:'app/(tabs)/home.tsx',cat:'TABS',icon:'H'},
  {path:'app/(tabs)/butler.tsx',cat:'TABS',icon:'B'},
  {path:'app/(tabs)/scripts.tsx',cat:'TABS',icon:'S'},
  {path:'app/(tabs)/knowledge.tsx',cat:'TABS',icon:'K'},
  {path:'app/(tabs)/logs.tsx',cat:'TABS',icon:'L'},
  {path:'app/(tabs)/connect.tsx',cat:'TABS',icon:'C'},
  {path:'app/(tabs)/fileshare.tsx',cat:'TABS',icon:'F'},
  {path:'app/(tabs)/builder.tsx',cat:'TABS',icon:'B'},
  {path:'app/(tabs)/cosmetic.tsx',cat:'TABS',icon:'C'},
  {path:'app/(tabs)/settings.tsx',cat:'TABS',icon:'S'},
  {path:'app/(tabs)/nexushome.tsx',cat:'TABS',icon:'N'},
  {path:'app/(tabs)/_layout.tsx',cat:'LAYOUT',icon:'L'},
  {path:'app/_layout.tsx',cat:'LAYOUT',icon:'L'},
  {path:'constants/theme.ts',cat:'CONSTANTS',icon:'T'},
  {path:'services/serverConnection.ts',cat:'SERVICES',icon:'S'},
  {path:'services/haptics.ts',cat:'SERVICES',icon:'H'},
  {path:'services/scriptLibraryData.ts',cat:'SERVICES',icon:'D'},
];
var sources={};var edits={};var current=null;var sq='';
function init(){
  try{var sv=localStorage.getItem('butler_ide_src');if(sv)sources=JSON.parse(sv);}catch(e){}
  try{var ev=localStorage.getItem('butler_ide_edits');if(ev)edits=JSON.parse(ev);}catch(e){}
  Object.keys(EMBEDDED).forEach(function(k){if(EMBEDDED[k]&&!sources[k])sources[k]=EMBEDDED[k];});
  renderSidebar();
  var first=ALL_FILES.find(function(f){return sources[f.path]||edits[f.path];});
  if(first)openFile(first.path);
}
function renderSidebar(){
  var cats={};
  ALL_FILES.forEach(function(f){if(!cats[f.cat])cats[f.cat]=[];cats[f.cat].push(f);});
  var html='';
  Object.keys(cats).forEach(function(cat){
    html+='<div class="cat-label">'+cat+'</div>';
    cats[cat].forEach(function(f){
      var hasSrc=!!(sources[f.path]||edits[f.path]);
      var isEd=!!edits[f.path];
      var name=f.path.split('/').pop();
      var lines=((edits[f.path]||sources[f.path])||'').split('\\n').length;
      var cls='file-item'+(hasSrc?' cached':'')+(isEd?' edited':'')+(current===f.path?' active':'');
      if(sq&&hasSrc&&!(sources[f.path]||'').toLowerCase().includes(sq.toLowerCase())&&!(edits[f.path]||'').toLowerCase().includes(sq.toLowerCase()))cls+=' no-match';
      html+='<div class="'+cls+'" onclick="openFile('+JSON.stringify(f.path)+')">';
      html+='<span class="fi-icon" style="color:#4A9EFF;font-weight:900;font-size:10px;min-width:14px">'+f.icon+'</span>';
      html+='<div style="flex:1;min-width:0">';
      html+='<div class="fi-name">'+name+'</div>';
      html+='<div class="fi-path">'+f.path+'</div>';
      if(hasSrc)html+='<div class="fi-meta">'+lines+' lines'+(isEd?' · EDITED':'')+'</div>';
      else html+='<div style="font-size:8px;color:#FF4D5E;margin-top:2px">empty — paste source</div>';
      html+='</div></div>';
    });
  });
  // custom pasted files
  Object.keys(sources).forEach(function(p){
    var known=ALL_FILES.find(function(f){return f.path===p;});
    if(!known&&sources[p]){
      var isEd=!!edits[p];var name=p.split('/').pop();var lines=(edits[p]||sources[p]).split('\\n').length;
      var cls='file-item cached'+(isEd?' edited':'')+(current===p?' active':'');
      html+='<div class="'+cls+'" onclick="openFile('+JSON.stringify(p)+')">';
      html+='<span class="fi-icon" style="color:#6B7A92;font-size:10px">*</span>';
      html+='<div style="flex:1;min-width:0"><div class="fi-name">'+name+'</div>';
      html+='<div class="fi-path">'+p+'</div>';
      html+='<div class="fi-meta">'+lines+' lines'+(isEd?' · EDITED':'')+'</div></div></div>';
    }
  });
  document.getElementById('file-list').innerHTML=html;
}
function openFile(p){
  current=p;
  document.getElementById('welcome').style.display='none';
  document.getElementById('tb-path').textContent=p;
  var src=edits[p]||sources[p]||'';
  renderCode(src);
  document.getElementById('edit-ta').value=src;
  renderSidebar();
}
function renderCode(src){
  var lines=src.split('\\n');
  document.getElementById('line-nums').textContent=lines.map(function(_,i){return i+1;}).join('\\n');
  var h=hlSrc(src);
  if(sq){h=h.replace(new RegExp('('+escRe(escH(sq))+')','gi'),'<span class="sh">$1</span>');}
  document.getElementById('code-body').innerHTML=h;
}
function hlSrc(src){
  var r=escH(src);
  r=r.replace(/(\/\*[\s\S]*?\*\/)/g,'<span class="cmt">$1</span>');
  r=r.replace(/(\/\/[^\\n]*)/g,'<span class="cmt">$1</span>');
  r=r.replace(/('[^'\\\\\\n]*(?:\\\\.[^'\\\\\\n]*)*')/g,'<span class="str">$1</span>');
  r=r.replace(/(\\"[^\\"\\\\\\n]*(?:\\\\.[^\\"\\\\\\n]*)*\\")/g,'<span class="str">$1</span>');
  r=r.replace(/(?<![a-zA-Z#])(\\d+\\.?\\d*)/g,'<span class="num">$1</span>');
  r=r.replace(/\\b(import|export|from|default|const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|typeof|async|await|class|extends|interface|type|enum|readonly|abstract|as|null|undefined|true|false|void|this|super|static|public|private|protected)\\b/g,'<span class="kw">$1</span>');
  r=r.replace(/\\b([A-Z][A-Za-z0-9]{2,})/g,'<span class="type">$1</span>');
  return r;
}
function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escRe(s){return s.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&');}
function openEdit(){
  if(!current){alert('Select a file first');return;}
  document.getElementById('edit-panel').classList.add('open');
  document.getElementById('edit-ta').value=edits[current]||sources[current]||'';
  document.getElementById('edit-ta').focus();
}
function closeEdit(){document.getElementById('edit-panel').classList.remove('open');}
function saveEdit(){
  if(!current)return;
  var n=document.getElementById('edit-ta').value;
  var o=sources[current]||'';
  if(n===o){delete edits[current];}else{edits[current]=n;}
  try{localStorage.setItem('butler_ide_edits',JSON.stringify(edits));}catch(e){}
  renderCode(n);renderSidebar();
}
function revertFile(){
  if(!current||!confirm('Revert '+current+'?'))return;
  delete edits[current];
  try{localStorage.setItem('butler_ide_edits',JSON.stringify(edits));}catch(e){}
  var src=sources[current]||'';
  document.getElementById('edit-ta').value=src;
  renderCode(src);renderSidebar();
}
function doSearch(q){
  sq=q.trim();
  if(current)renderCode(edits[current]||sources[current]||'');
  renderSidebar();
}
function copyCurrentFile(){
  if(!current){alert('No file selected');return;}
  var src=edits[current]||sources[current]||'';
  nc(src,function(){toast('Copied: '+current);});
}
function copyAllForAI(){
  var parts=[];
  ALL_FILES.forEach(function(f){var s=edits[f.path]||sources[f.path];if(s)parts.push('// ===== '+f.path+' =====\\n'+s);});
  Object.keys(sources).forEach(function(p){var k=ALL_FILES.find(function(f){return f.path===p;});if(!k&&sources[p])parts.push('// ===== '+p+' =====\\n'+(edits[p]||sources[p]));});
  var BT3=String.fromCharCode(96,96,96);
  var hdr='// Butler AI v7.3 — Full Codebase for AI\\n// Generated: '+new Date().toISOString()+'\\n// '+parts.length+' files loaded\\n// Stack: React Native · Expo Router · TypeScript · Expo\\n// To edit: describe changes + file path, AI applies them\\n\\n';
  var txt=hdr+parts.join('\\n\\n// '+'-'.repeat(60)+'\\n\\n');
  nc(txt,function(){toast('All '+parts.length+' files copied for AI context!');});
}
function genPrompt(){
  if(!current){alert('Select a file first');return;}
  var p=buildPrompt(current);
  document.getElementById('prompt-text').textContent=p;
  document.getElementById('prompt-panel').classList.toggle('open');
}
function copySelectedPrompt(){
  if(!current){alert('Select a file first');return;}
  var p=buildPrompt(current);
  nc(p,function(){toast('AI prompt copied!');document.getElementById('prompt-panel').classList.remove('open');});
}
function buildPrompt(path){
  var orig=sources[path]||'';var mod=edits[path]||orig;
  var BT3=String.fromCharCode(96,96,96);
  if(!edits[path])return 'BUTLER AI — FILE CONTEXT\\nFile: '+path+'\\n\\n'+BT3+'typescript\\n'+orig+'\\n'+BT3+'\\n\\n---\\nDescribe your changes below this line.';
  return 'Update Butler AI (React Native / Expo Router).\\n\\nFile: '+path+'\\n\\nCurrent code:\\n'+BT3+'typescript\\n'+orig+'\\n'+BT3+'\\n\\nUpdated code:\\n'+BT3+'typescript\\n'+mod+'\\n'+BT3+'\\n\\nApply these exact changes to the file. Keep all other imports, components, and styles intact.';
}
function exportAllFiles(){
  var parts=[];
  ALL_FILES.forEach(function(f){var s=edits[f.path]||sources[f.path];if(s)parts.push('/* FILE: '+f.path+' */\\n'+s);});
  Object.keys(sources).forEach(function(p){var k=ALL_FILES.find(function(f){return f.path===p;});if(!k&&sources[p])parts.push('/* FILE: '+p+' */\\n'+(edits[p]||sources[p]));});
  var txt=parts.join('\\n\\n/* ========================================== */\\n\\n');
  var blob=new Blob([txt],{type:'text/plain'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='butler_ai_codebase_'+Date.now()+'.txt';a.click();
  toast('Exported '+parts.length+' files as .txt');
}
function nc(txt,cb){
  navigator.clipboard.writeText(txt).then(cb).catch(function(){
    var ta=document.createElement('textarea');ta.value=txt;
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);if(cb)cb();
  });
}
function openPasteDialog(p){
  if(p)document.getElementById('paste-path').value=p;
  document.getElementById('paste-ta').value='';
  document.getElementById('paste-overlay').classList.add('open');
  setTimeout(function(){document.getElementById('paste-ta').focus();},100);
}
function overlayClick(e){if(e.target===document.getElementById('paste-overlay'))closePaste();}
function closePaste(){document.getElementById('paste-overlay').classList.remove('open');}
function confirmPaste(){
  var p=document.getElementById('paste-path').value.trim();
  var s=document.getElementById('paste-ta').value;
  if(!p){alert('Enter a file path');return;}
  if(!s){alert('Paste source code');return;}
  sources[p]=s;
  try{localStorage.setItem('butler_ide_src',JSON.stringify(sources));}catch(e){}
  closePaste();renderSidebar();openFile(p);toast('Saved: '+p);
}
function toast(msg){
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2FE38A;color:#fff;padding:9px 20px;border-radius:8px;font-size:11px;font-weight:700;z-index:9999;pointer-events:none;font-family:Menlo,monospace';
  document.body.appendChild(t);setTimeout(function(){t.remove();},2200);
}
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveEdit();}
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();document.getElementById('search-inp').focus();}
  if(e.key==='Escape'){closeEdit();document.getElementById('prompt-panel').classList.remove('open');}
});
init();
</script>
</body></html>`;
}

// ─── Export/Import modal ──────────────────────────────────────
const IDEExportPanel = memo(({ visible, onClose }: { visible:boolean; onClose:()=>void }) => {
  const [status, setStatus]     = useState('');
  const [exporting, setExp]     = useState(false);
  const [caching, setCaching]   = useState(false);
  const shakeA = useRef(new Animated.Value(0)).current;

  const shake = () => Animated.sequence([
    Animated.timing(shakeA, { toValue:8, duration:55, useNativeDriver:true }),
    Animated.timing(shakeA, { toValue:-8, duration:55, useNativeDriver:true }),
    Animated.timing(shakeA, { toValue:4, duration:55, useNativeDriver:true }),
    Animated.timing(shakeA, { toValue:0, duration:55, useNativeDriver:true }),
  ]).start();

  const doExport = async () => {
    haptics.heavy(); setExp(true); setStatus('Building Codebase IDE…');
    try {
      const files: {path:string; source:string}[] = [];
      const tabPaths = [
        'home.tsx','butler.tsx','scripts.tsx','knowledge.tsx',
        'logs.tsx','connect.tsx','fileshare.tsx','builder.tsx',
        'cosmetic.tsx','settings.tsx','nexushome.tsx',
      ];
      for (const p of tabPaths) {
        try {
          const cached = await AsyncStorage.getItem('@butler_src_' + p).catch(() => null);
          files.push({ path:'app/(tabs)/'+p, source: cached || '' });
        } catch { files.push({ path:'app/(tabs)/'+p, source:'' }); }
      }
      // Layout files
      try {
        const l1 = await AsyncStorage.getItem('@butler_src__layout.tsx').catch(() => null);
        if (l1) files.push({ path:'app/(tabs)/_layout.tsx', source:l1 });
        const l2 = await AsyncStorage.getItem('@butler_src_app_layout.tsx').catch(() => null);
        if (l2) files.push({ path:'app/_layout.tsx', source:l2 });
      } catch {}

      const loaded = files.filter(f => f.source).length;
      const html = buildHtmlIDE(files);

      let shared = false;
      try {
        const FS = require('expo-file-system');
        const SH = require('expo-sharing');
        const uri = FS.cacheDirectory + 'butler_ai_ide_' + Date.now() + '.html';
        await FS.writeAsStringAsync(uri, html, { encoding: FS.EncodingType.UTF8 });
        const canShare = await SH.isAvailableAsync();
        if (canShare) {
          await SH.shareAsync(uri, { mimeType:'text/html', dialogTitle:'Save Butler AI IDE', UTI:'public.html' });
          shared = true;
        }
      } catch {}

      if (!shared) {
        await ExpoClipboard.setStringAsync(html.slice(0, 950000));
        Alert.alert('IDE HTML Copied', `Codebase IDE HTML copied (${Math.round(html.length/1024)}KB). Paste into a text file, save as .html, and open in browser.\n\n${loaded}/${files.length} files have cached source.`, [{ text:'OK' }]);
      }

      setStatus(`✓ IDE exported (${loaded}/${files.length} files with source)`);
      haptics.success();
    } catch (e:any) {
      setStatus('Error: ' + (e?.message||'export failed'));
      shake();
    }
    setExp(false);
  };

  const doCacheAll = async () => {
    haptics.medium(); setCaching(true);
    setStatus('Navigate through each tab to cache its source, then export again.');
    setTimeout(() => {
      setCaching(false);
      Alert.alert(
        'HOW TO CACHE SOURCES',
        'To get full source in the IDE:\n\n1. Open OnSpace Code View (top-right <> button)\n2. For each tab file, copy the full content\n3. Open the exported HTML in your browser\n4. Click + PASTE FILE\n5. Enter the path and paste the source\n\nAlternatively, tap each tab in the app — if tabs register their source automatically, they will be cached for the next export.',
        [{ text:'OK' }]
      );
    }, 400);
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.88)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:SURF, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'90%' }}>
          <View style={{ height:3, flexDirection:'row' }}>
            <View style={{ flex:1, backgroundColor:PURP }} />
            <View style={{ flex:1, backgroundColor:CYAN }} />
            <View style={{ flex:1, backgroundColor:GREEN }} />
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', gap:10, padding:16, paddingBottom:12 }}>
            <MaterialCommunityIcons name="code-json" size={20} color={PURP} />
            <View style={{ flex:1 }}>
              <Text style={{ fontFamily:MONO, fontSize:15, fontWeight:'900', color:TEXT }}>CODEBASE IDE</Text>
              <Text style={{ fontFamily:MONO, fontSize:9, color:MID, marginTop:2 }}>VS Code-style HTML · Edit any file · Generate AI prompts</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={{ padding:4 }}>
              <MaterialIcons name="close" size={22} color={MID} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:16, gap:12, paddingBottom:40 }}>

            {/* What you get */}
            <View style={{ backgroundColor:SURF2, borderRadius:12, borderWidth:1.5, borderColor:PURP+'30', padding:14, gap:8 }}>
              <Text style={{ fontFamily:MONO, fontSize:10, fontWeight:'900', color:PURP, letterSpacing:1.2 }}>WHAT THE IDE GIVES YOU</Text>
              {[
                { t:'File tree sidebar with all 17 source files', c:CYAN },
                { t:'Syntax-highlighted code viewer with line numbers', c:GREEN },
                { t:'Edit mode — modify any file in the browser', c:AMBER },
                { t:'GEN PROMPT — creates precise diff-style AI messages', c:PURP },
                { t:'COPY ALL FOR AI — full codebase for Claude/ChatGPT', c:CYAN },
                { t:'Changes saved to browser localStorage permanently', c:GREEN },
              ].map((it,i) => (
                <View key={i} style={{ flexDirection:'row', alignItems:'flex-start', gap:8 }}>
                  <View style={{ width:5, height:5, borderRadius:2.5, backgroundColor:it.c, marginTop:6, flexShrink:0 }} />
                  <Text style={{ fontFamily:MONO, fontSize:10, color:MID, flex:1, lineHeight:15 }}>{it.t}</Text>
                </View>
              ))}
            </View>

            {/* Main export button */}
            <TouchableOpacity onPress={doExport} disabled={exporting} activeOpacity={0.85}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
                backgroundColor: exporting ? DIM : PURP, borderRadius:14, paddingVertical:15 }}>
              {exporting
                ? <ActivityIndicator color={TEXT} size="small" />
                : <MaterialCommunityIcons name="export-variant" size={20} color={exporting?MID:'#000'} />}
              <Text style={{ fontFamily:MONO, fontSize:14, fontWeight:'900', color: exporting ? MID : '#000' }}>
                {exporting ? 'BUILDING IDE…' : 'EXPORT CODEBASE IDE'}
              </Text>
            </TouchableOpacity>

            {/* Cache sources helper */}
            <TouchableOpacity onPress={doCacheAll} disabled={caching} activeOpacity={0.85}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
                backgroundColor: CYAN+'0F', borderRadius:14, paddingVertical:13,
                borderWidth:1.5, borderColor: CYAN+'55' }}>
              {caching
                ? <ActivityIndicator color={CYAN} size="small" />
                : <MaterialCommunityIcons name="sync" size={18} color={CYAN} />}
              <Text style={{ fontFamily:MONO, fontSize:12, fontWeight:'900', color: caching ? MID : CYAN }}>
                HOW TO LOAD SOURCE FILES
              </Text>
            </TouchableOpacity>

            {/* Copy all source */}
            <TouchableOpacity
              onPress={async () => {
                haptics.medium();
                try {
                  const parts: string[] = [];
                  const tabPaths = ['home.tsx','butler.tsx','scripts.tsx','knowledge.tsx','logs.tsx','connect.tsx','fileshare.tsx','builder.tsx','cosmetic.tsx','settings.tsx'];
                  for (const p of tabPaths) {
                    const cached = await AsyncStorage.getItem('@butler_src_' + p).catch(() => null);
                    if (cached) parts.push(`// ===== app/(tabs)/${p} =====\n${cached}`);
                  }
                  if (parts.length === 0) { Alert.alert('No sources cached', 'Visit each tab first to cache sources, or use the IDE PASTE FILE feature.'); return; }
                  const all = `// Butler AI v7.3 — Full Codebase\n// Generated: ${new Date().toISOString()}\n// ${parts.length} files\n\n` + parts.join('\n\n// ────────────────────────────────────\n\n');
                  await ExpoClipboard.setStringAsync(all.slice(0, 500000));
                  haptics.success();
                  setStatus(`✓ ${parts.length} files copied to clipboard`);
                } catch (e:any) { setStatus('Copy failed: ' + e?.message); }
              }}
              activeOpacity={0.85}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
                backgroundColor:AMBER+'0F', borderRadius:14, paddingVertical:13,
                borderWidth:1.5, borderColor:AMBER+'45' }}>
              <MaterialIcons name="content-copy" size={18} color={AMBER} />
              <View style={{ gap:2 }}>
                <Text style={{ fontFamily:MONO, fontSize:12, fontWeight:'900', color:AMBER }}>COPY ALL SOURCE</Text>
                <Text style={{ fontFamily:MONO, fontSize:8.5, color:MID, textAlign:'center' }}>All cached files → clipboard for AI tools</Text>
              </View>
            </TouchableOpacity>

            {/* Status */}
            {!!status && (
              <Animated.View style={{ transform:[{translateX:shakeA}], borderWidth:1.5, borderRadius:10, padding:11,
                borderColor: (status.startsWith('✓') ? GREEN : RED) + '45',
                backgroundColor: (status.startsWith('✓') ? GREEN : RED) + '08',
                flexDirection:'row', alignItems:'center', gap:8 }}>
                <MaterialIcons name={status.startsWith('✓') ? 'check-circle' : 'error-outline'} size={15}
                  color={status.startsWith('✓') ? GREEN : RED} />
                <Text style={{ fontFamily:MONO, fontSize:10.5, color: status.startsWith('✓') ? GREEN : RED, flex:1 }}>
                  {status}
                </Text>
                <TouchableOpacity onPress={() => setStatus('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <MaterialIcons name="close" size={12} color={MID} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Credit saving tips */}
            <View style={{ backgroundColor:SURF, borderRadius:12, borderWidth:1.5, borderColor:GREEN+'25', padding:13, gap:7 }}>
              <Text style={{ fontFamily:MONO, fontSize:9, color:GREEN+'90', fontWeight:'900', letterSpacing:1.2 }}>HOW TO SAVE CREDITS</Text>
              {[
                { tip:'Open IDE → EDIT a component → SAVE → PROMPT → paste in OnSpace chat', c:CYAN },
                { tip:'COPY ALL FOR AI → paste in Claude/ChatGPT → ask it to write the edit → paste back here', c:GREEN },
                { tip:'Edit StyleSheet values only (colors, sizes) → one message applies all visual changes', c:AMBER },
                { tip:'Use <!-- EDIT: description --> comments in the file to mark what you changed', c:PURP },
              ].map((t,i) => (
                <View key={i} style={{ flexDirection:'row', alignItems:'flex-start', gap:7 }}>
                  <View style={{ width:3, height:3, borderRadius:1.5, backgroundColor:t.c, marginTop:6, flexShrink:0 }} />
                  <Text style={{ fontFamily:MONO, fontSize:9.5, color:MID, flex:1, lineHeight:15 }}>{t.tip}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

function SettingsInner() {
  const insets = useSafeAreaInsets();
  const [showIDEPanel, setShowIDEPanel] = useState(false);

  const handleAction = async (action: string) => {
    haptics.medium();
    switch (action) {
      case 'exportHtml':
      case 'cacheAll':
      case 'copySource':
        setShowIDEPanel(true);
        return;
      case 'pair':
        try { (global as any).__nexusHomeOpenQR?.(); } catch {}
        break;
      case 'github':
        Linking.openURL('https://github.com/shawnjan-cmd/butler-server/releases/latest').catch(() => {});
        break;
      case 'clearChat':
        Alert.alert('Clear Chat History', 'Delete all Butler AI chat sessions?', [
          { text:'Cancel', style:'cancel' },
          { text:'CLEAR', style:'destructive', onPress: async () => {
            try { await AsyncStorage.removeItem('@butler_sessions_v1'); haptics.success(); } catch {}
          }},
        ]);
        break;
      case 'deleteAll':
        Alert.alert('Delete All Data', 'This will wipe ALL local app data permanently. This cannot be undone.', [
          { text:'Cancel', style:'cancel' },
          { text:'DELETE ALL', style:'destructive', onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              const butlerKeys = keys.filter(k => k.startsWith('@butler') || k.startsWith('butler'));
              await AsyncStorage.multiRemove(butlerKeys);
              haptics.success();
            } catch {}
          }},
        ]);
        break;
      case 'forget':
        Alert.alert('Forget PC', 'Remove paired PC credentials?', [
          { text:'Cancel', style:'cancel' },
          { text:'FORGET', style:'destructive', onPress: async () => {
            try {
              await AsyncStorage.multiRemove(['butler.sessionToken','butler.hostIp','butler.hostPort']);
              haptics.success();
            } catch {}
          }},
        ]);
        break;
      case 'ollama': {
        // Live check against the paired PC instead of telling the user to go elsewhere.
        const names = await listOllamaModels();
        if (names.length) {
          haptics.success();
          Alert.alert('Ollama Online', `${names.length} local model${names.length > 1 ? 's' : ''} ready:\n\n` + names.slice(0, 8).join('\n'));
        } else {
          Alert.alert('Ollama Unreachable', 'No models found. Pair your PC and make sure Ollama is running (ollama serve).');
        }
        break;
      }
      case 'pull': {
        const r = await askButler('Pull the qwen2.5-coder:7b model with Ollama and report progress.');
        Alert.alert(r.online ? 'Pull Requested' : 'Not Paired', r.reply);
        break;
      }
    }
  };

  const renderItem = useCallback(({ item }: { item: SettingItem }) => {
    if (item.type === 'header') {
      return (
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingTop:18, paddingBottom:8 }}>
          <View style={{ width:3, height:14, borderRadius:2, backgroundColor: item.color }} />
          <Text style={{ fontFamily:MONO, fontSize:10, fontWeight:'900', color: item.color+'90', letterSpacing:2 }}>
            {item.label}
          </Text>
          <View style={{ flex:1, height:1, backgroundColor: item.color+'20' }} />
        </View>
      );
    }
    if (item.type === 'action') {
      return (
        <TouchableOpacity onPress={() => handleAction(item.action)} activeOpacity={0.8}
          style={[SI.row, { borderColor: (item.danger?RED:item.color)+'25' }]}>
          <View style={[SI.iconBox, { backgroundColor: (item.danger?RED:item.color)+'10', borderColor: (item.danger?RED:item.color)+'35' }]}>
            <MaterialIcons name={item.icon as any} size={18} color={item.danger?RED:item.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[SI.label, { color: item.danger ? RED : TEXT }]}>{item.label}</Text>
            <Text style={SI.sub}>{item.sub}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={18} color={MID} />
        </TouchableOpacity>
      );
    }
    if (item.type === 'link') {
      return (
        <TouchableOpacity onPress={() => Linking.openURL(item.url).catch(()=>{})} activeOpacity={0.8}
          style={[SI.row, { borderColor: item.color+'25' }]}>
          <View style={[SI.iconBox, { backgroundColor: item.color+'10', borderColor: item.color+'35' }]}>
            <MaterialIcons name={item.icon as any} size={18} color={item.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[SI.label, { color:TEXT }]}>{item.label}</Text>
            <Text style={SI.sub}>{item.sub}</Text>
          </View>
          <MaterialIcons name="open-in-new" size={16} color={MID} />
        </TouchableOpacity>
      );
    }
    if (item.type === 'info') {
      return (
        <View style={[SI.row, { borderColor: item.color+'15', opacity:0.85 }]}>
          <View style={[SI.iconBox, { backgroundColor: item.color+'08', borderColor: item.color+'20' }]}>
            <MaterialIcons name={item.icon as any} size={18} color={item.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[SI.label, { color:TEXT+'CC' }]}>{item.label}</Text>
            <Text style={SI.sub}>{item.sub}</Text>
          </View>
          <View style={{ width:6, height:6, borderRadius:3, backgroundColor: item.color+'60' }} />
        </View>
      );
    }
    return null;
  }, []);

  return (
    <View style={{ flex:1, backgroundColor:BG }}>
      <ConfigHeader safeTop={insets.top} />

      <FlatList
        data={SETTINGS}
        keyExtractor={(item, i) => `${item.type}-${i}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <IDEExportPanel visible={showIDEPanel} onClose={() => setShowIDEPanel(false)} />

      <View style={{ backgroundColor:SURF, borderTopWidth:1, borderTopColor: DIM+'80', paddingTop:8, paddingBottom:Math.max(insets.bottom+4,10), paddingHorizontal:14 }}>
        <Text style={{ fontFamily:MONO, fontSize:8, color:MID, textAlign:'center', lineHeight:13 }}>
          BUTLER AI v7.3.0 · © 2026 ANDREJ SLADKOVIC · ALL RIGHTS RESERVED{'\n'}
          PROPRIETARY · LAN ONLY · ZERO TELEMETRY · AES-256-GCM
        </Text>
      </View>
    </View>
  );
}
const SI = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'center', gap:12, marginHorizontal:14, marginBottom:6, padding:12, backgroundColor:SURF, borderRadius:12, borderWidth:1.5 },
  iconBox: { width:38, height:38, borderRadius:10, borderWidth:1.5, alignItems:'center', justifyContent:'center', flexShrink:0 },
  label:   { fontFamily:MONO, fontSize:13, fontWeight:'700', lineHeight:17 },
  sub:     { fontFamily:MONO, fontSize:9.5, color:MID, lineHeight:14, marginTop:2 },
});

export default function SettingsScreen() {
  return <TabErrorBoundary name="Settings"><SettingsInner /></TabErrorBoundary>;
}
