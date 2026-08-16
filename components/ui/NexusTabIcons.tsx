/**
 * NexusTabIcons — Unique hand-crafted SVG icons for each Butler AI tab.
 * Every icon is distinct, circuit-themed, and carries its own visual signature.
 * Uses react-native-svg for crisp rendering at all DPI levels.
 *
 * Usage:
 *   <NexusCoreIcon size={22} color="#38D9E8" active={true} />
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, {
  Path, Circle, Rect, Line, Polygon, G, Defs,
  LinearGradient, Stop, Ellipse, Polyline,
} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  active?: boolean;
  /** 0–1 opacity for inactive state */
  dimOpacity?: number;
}

const DEFAULT = '#38D9E8';
const DIM = 0.72;

// ── 01. CORE HOME — hexagonal circuit hub with lightning centre ──────────────
export function NexusCoreIcon({ size = 22, color = DEFAULT, active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : dimOpacity;
  const s = size;
  const cx = s / 2, cy = s / 2;
  const r = s * 0.44;
  // Hex points
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  const ir = r * 0.54; // inner ring
  const innerHex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + ir * Math.cos(a)},${cy + ir * Math.sin(a)}`;
  }).join(' ');
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Outer hex — always visible outline */}
      <Polygon points={hex} stroke={color} strokeWidth={active ? s * 0.055 : s * 0.065} fill="none" />
      {/* Inner hex */}
      <Polygon points={innerHex} stroke={color} strokeWidth={active ? s * 0.04 : s * 0.05} fill="none" opacity={active ? 0.45 : 0.65} />
      {/* Corner dots */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return <Circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={s * 0.05} fill={color} opacity={active ? 1 : 0.8} />;
      })}
      {/* Lightning bolt centre */}
      <Path
        d={`M${cx - s*0.07} ${cy - s*0.18} L${cx + s*0.04} ${cy - s*0.02} L${cx - s*0.01} ${cy - s*0.02} L${cx + s*0.07} ${cy + s*0.18} L${cx - s*0.04} ${cy + s*0.02} L${cx + s*0.01} ${cy + s*0.02} Z`}
        fill={color}
        opacity={active ? 1 : 0.75}
      />
      {/* Radial connector lines */}
      {[0, 2, 4].map(i => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return (
          <Line
            key={i}
            x1={cx + ir * Math.cos(a)} y1={cy + ir * Math.sin(a)}
            x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
            stroke={color} strokeWidth={s * 0.035} opacity={active ? 0.5 : 0.6}
          />
        );
      })}
    </Svg>
  );
}

// ── 02. FORGE SCRIPTS — angled code brackets with spark eruption ─────────────
export function ForgeScriptsIcon({ size = 22, color = '#A468FF', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Left angle bracket < */}
      <Path
        d={`M${cx - s*0.1} ${cy} L${cx - s*0.32} ${cy - s*0.22} L${cx - s*0.32} ${cy - s*0.22}`}
        stroke={color} strokeWidth={s * 0.07} fill="none" strokeLinecap="round"
      />
      <Path
        d={`M${cx - s*0.1} ${cy} L${cx - s*0.32} ${cy + s*0.22}`}
        stroke={color} strokeWidth={s * 0.07} fill="none" strokeLinecap="round"
      />
      {/* Right angle bracket > */}
      <Path
        d={`M${cx + s*0.1} ${cy} L${cx + s*0.32} ${cy - s*0.22}`}
        stroke={color} strokeWidth={s * 0.07} fill="none" strokeLinecap="round"
      />
      <Path
        d={`M${cx + s*0.1} ${cy} L${cx + s*0.32} ${cy + s*0.22}`}
        stroke={color} strokeWidth={s * 0.07} fill="none" strokeLinecap="round"
      />
      {/* Spark lightning in centre */}
      <Path
        d={`M${cx + s*0.04} ${cy - s*0.19} L${cx - s*0.04} ${cy - s*0.02} L${cx + s*0.03} ${cy - s*0.02} L${cx - s*0.04} ${cy + s*0.19} L${cx + s*0.04} ${cy + s*0.02} L${cx - s*0.03} ${cy + s*0.02} Z`}
        fill={color}
      />
      {/* Decorative dot ticks */}
      <Circle cx={cx} cy={cy - s*0.42} r={s*0.038} fill={color} opacity={0.6} />
      <Circle cx={cx} cy={cy + s*0.42} r={s*0.038} fill={color} opacity={0.6} />
    </Svg>
  );
}

// ── 03. BUTLER AI — stylised robot visor with antenna array ─────────────────
export function ButlerAIIcon({ size = 22, color = '#2FE38A', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2 + s * 0.04;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Antenna left */}
      <Line x1={cx - s*0.22} y1={cy - s*0.34} x2={cx - s*0.22} y2={cy - s*0.46} stroke={color} strokeWidth={s*0.05} strokeLinecap="round" />
      <Circle cx={cx - s*0.22} cy={cy - s*0.49} r={s*0.05} fill={color} />
      {/* Antenna right */}
      <Line x1={cx + s*0.22} y1={cy - s*0.34} x2={cx + s*0.22} y2={cy - s*0.46} stroke={color} strokeWidth={s*0.05} strokeLinecap="round" />
      <Circle cx={cx + s*0.22} cy={cy - s*0.49} r={s*0.05} fill={color} />
      {/* Head outline — rounded rect */}
      <Rect
        x={cx - s*0.33} y={cy - s*0.33}
        width={s*0.66} height={s*0.58}
        rx={s*0.1} ry={s*0.1}
        stroke={color} strokeWidth={s*0.055} fill="none"
      />
      {/* Visor bar */}
      <Rect
        x={cx - s*0.23} y={cy - s*0.17}
        width={s*0.46} height={s*0.16}
        rx={s*0.04} ry={s*0.04}
        fill={color} opacity={active ? 0.85 : 0.55}
      />
      {/* Eye pupils in visor */}
      <Rect x={cx - s*0.17} y={cy - s*0.14} width={s*0.1} height={s*0.1} rx={s*0.02} fill={active ? '#000' : color} opacity={active ? 1 : 0} />
      <Rect x={cx + s*0.07} y={cy - s*0.14} width={s*0.1} height={s*0.1} rx={s*0.02} fill={active ? '#000' : color} opacity={active ? 1 : 0} />
      {/* Smile */}
      <Path
        d={`M${cx - s*0.15} ${cy + s*0.1} Q${cx} ${cy + s*0.21} ${cx + s*0.15} ${cy + s*0.1}`}
        stroke={color} strokeWidth={s*0.05} fill="none" strokeLinecap="round"
      />
      {/* Ears (side receivers) */}
      <Rect x={cx - s*0.43} y={cy - s*0.08} width={s*0.1} height={s*0.16} rx={s*0.03} fill={color} opacity={0.6} />
      <Rect x={cx + s*0.33} y={cy - s*0.08} width={s*0.1} height={s*0.16} rx={s*0.03} fill={color} opacity={0.6} />
    </Svg>
  );
}

// ── 04. KNOWLEDGE BASE — brain with circuit node overlay ─────────────────────
export function KnowledgeBaseIcon({ size = 22, color = '#38D9E8', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Left brain lobe */}
      <Path
        d={`M${cx} ${cy + s*0.26}
            C${cx - s*0.08} ${cy + s*0.32} ${cx - s*0.35} ${cy + s*0.28} ${cx - s*0.38} ${cy + s*0.08}
            C${cx - s*0.42} ${cy - s*0.12} ${cx - s*0.28} ${cy - s*0.32} ${cx - s*0.14} ${cy - s*0.36}
            C${cx - s*0.06} ${cy - s*0.38} ${cx} ${cy - s*0.34} ${cx} ${cy - s*0.26}
            Z`}
        stroke={color} strokeWidth={s*0.05} fill="none"
      />
      {/* Right brain lobe */}
      <Path
        d={`M${cx} ${cy + s*0.26}
            C${cx + s*0.08} ${cy + s*0.32} ${cx + s*0.35} ${cy + s*0.28} ${cx + s*0.38} ${cy + s*0.08}
            C${cx + s*0.42} ${cy - s*0.12} ${cx + s*0.28} ${cy - s*0.32} ${cx + s*0.14} ${cy - s*0.36}
            C${cx + s*0.06} ${cy - s*0.38} ${cx} ${cy - s*0.34} ${cx} ${cy - s*0.26}
            Z`}
        stroke={color} strokeWidth={s*0.05} fill="none"
      />
      {/* Brain divider */}
      <Line x1={cx} y1={cy - s*0.26} x2={cx} y2={cy + s*0.26} stroke={color} strokeWidth={s*0.04} opacity={0.4} />
      {/* Circuit nodes */}
      <Circle cx={cx - s*0.16} cy={cy - s*0.06} r={s*0.06} fill={color} />
      <Circle cx={cx + s*0.16} cy={cy - s*0.06} r={s*0.06} fill={color} />
      <Circle cx={cx} cy={cy + s*0.08} r={s*0.055} fill={color} opacity={0.7} />
      {/* Node connectors */}
      <Line x1={cx - s*0.16} y1={cy - s*0.06} x2={cx + s*0.16} y2={cy - s*0.06} stroke={color} strokeWidth={s*0.03} opacity={0.5} />
      <Line x1={cx} y1={cy - s*0.06} x2={cx} y2={cy + s*0.08} stroke={color} strokeWidth={s*0.03} opacity={0.5} />
    </Svg>
  );
}

// ── 05. INTEL LOGS — EKG heartbeat wave with bar-chart pillars ───────────────
export function IntelLogsIcon({ size = 22, color = '#FFB43D', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const baseline = s * 0.66;
  // Bar heights (left to right) — irregular for visual interest
  const bars = [0.22, 0.45, 0.30, 0.72, 0.55, 0.38, 0.62, 0.28];
  const bw = s * 0.06, gap = (s - bars.length * bw) / (bars.length + 1);
  // EKG path across the top
  const ekgY = s * 0.28;
  const ekgPoints = [
    `0,${ekgY}`,
    `${s*0.22},${ekgY}`,
    `${s*0.30},${ekgY - s*0.16}`,
    `${s*0.36},${ekgY + s*0.22}`,
    `${s*0.44},${ekgY - s*0.08}`,
    `${s*0.52},${ekgY}`,
    `${s},${ekgY}`,
  ].join(' ');
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Bar chart */}
      {bars.map((h, i) => {
        const x = gap + i * (bw + gap);
        const barH = h * s * 0.46;
        return (
          <Rect
            key={i} x={x} y={baseline - barH}
            width={bw} height={barH}
            rx={bw * 0.4}
            fill={color}
            opacity={active ? 0.5 + i * 0.045 : 0.35}
          />
        );
      })}
      {/* Baseline */}
      <Line x1={0} y1={baseline} x2={s} y2={baseline} stroke={color} strokeWidth={s*0.03} opacity={0.3} />
      {/* EKG wave on top */}
      <Polyline points={ekgPoints} stroke={color} strokeWidth={s*0.05} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── 06. BUILDER — crossed wrench + hammer with gear tooth ────────────────────
export function BuilderIcon({ size = 22, color = '#4A9EFF', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Wrench — angled NW to SE */}
      <G transform={`rotate(-40, ${cx}, ${cy})`}>
        {/* Handle */}
        <Rect x={cx - s*0.05} y={cy - s*0.38} width={s*0.1} height={s*0.52} rx={s*0.025} fill={color} />
        {/* Head */}
        <Rect x={cx - s*0.16} y={cy - s*0.42} width={s*0.32} height={s*0.14} rx={s*0.06} fill={color} />
        {/* Jaw cutout suggestion */}
        <Rect x={cx - s*0.08} y={cy - s*0.44} width={s*0.16} height={s*0.08} rx={s*0.03} fill="#050810" />
      </G>
      {/* Hammer — angled NE to SW */}
      <G transform={`rotate(50, ${cx}, ${cy})`}>
        {/* Handle */}
        <Rect x={cx - s*0.04} y={cy - s*0.36} width={s*0.08} height={s*0.5} rx={s*0.02} fill={color} opacity={0.75} />
        {/* Head */}
        <Rect x={cx - s*0.15} y={cy - s*0.42} width={s*0.3} height={s*0.13} rx={s*0.04} fill={color} opacity={0.75} />
      </G>
      {/* Centre bolt */}
      <Circle cx={cx} cy={cy} r={s*0.1} fill="#050810" />
      <Circle cx={cx} cy={cy} r={s*0.06} fill={color} />
    </Svg>
  );
}

// ── 07. VAULT FILE SHARE — folder with bi-directional network arrows ──────────
export function VaultIcon({ size = 22, color = '#FF5FA8', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2;
  const ftop = s * 0.18, fleft = s * 0.05, fright = s * 0.95, fbottom = s * 0.8;
  const fh = fbottom - ftop, fw = fright - fleft;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Folder body */}
      <Path
        d={`M${fleft} ${ftop + s*0.1} L${fleft} ${fbottom} Q${fleft} ${fbottom + s*0.03} ${fleft + s*0.05} ${fbottom + s*0.03} L${fright - s*0.05} ${fbottom + s*0.03} Q${fright} ${fbottom + s*0.03} ${fright} ${fbottom} L${fright} ${ftop + s*0.1} Z`}
        stroke={color} strokeWidth={s*0.055} fill="none"
      />
      {/* Folder tab */}
      <Path
        d={`M${fleft} ${ftop + s*0.1} L${fleft} ${ftop + s*0.04} Q${fleft} ${ftop} ${fleft + s*0.05} ${ftop} L${cx - s*0.04} ${ftop} L${cx + s*0.04} ${ftop + s*0.1} L${fright} ${ftop + s*0.1}`}
        stroke={color} strokeWidth={s*0.055} fill="none"
      />
      {/* Upload arrow — up */}
      <Path
        d={`M${cx - s*0.15} ${s*0.54} L${cx - s*0.15} ${s*0.38} M${cx - s*0.15} ${s*0.38} L${cx - s*0.22} ${s*0.46} M${cx - s*0.15} ${s*0.38} L${cx - s*0.08} ${s*0.46}`}
        stroke={color} strokeWidth={s*0.06} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Download arrow — down */}
      <Path
        d={`M${cx + s*0.15} ${s*0.38} L${cx + s*0.15} ${s*0.54} M${cx + s*0.15} ${s*0.54} L${cx + s*0.22} ${s*0.46} M${cx + s*0.15} ${s*0.54} L${cx + s*0.08} ${s*0.46}`}
        stroke={color} strokeWidth={s*0.06} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Centre divider */}
      <Line x1={cx} y1={s*0.32} x2={cx} y2={s*0.62} stroke={color} strokeWidth={s*0.025} opacity={0.35} />
    </Svg>
  );
}

// ── 08. CONFIG — circuit-traced gear with 8 external teeth ───────────────────
export function ConfigIcon({ size = 22, color = '#FF7A1F', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2;
  const OR = s * 0.43, IR = s * 0.26, tooth = s * 0.09, toothW = 0.28;
  const gearPath = Array.from({ length: 8 }, (_, i) => {
    const a0 = (Math.PI * 2 * i) / 8;
    const a1 = a0 + Math.PI / 8 - toothW;
    const a2 = a0 + Math.PI / 8 + toothW;
    const a3 = a0 + Math.PI * 2 / 8;
    return [
      `L${cx + IR * Math.cos(a0)} ${cy + IR * Math.sin(a0)}`,
      `L${cx + (OR - tooth * 0.3) * Math.cos(a1)} ${cy + (OR - tooth * 0.3) * Math.sin(a1)}`,
      `L${cx + (OR + tooth * 0.6) * Math.cos((a1+a2)/2)} ${cy + (OR + tooth * 0.6) * Math.sin((a1+a2)/2)}`,
      `L${cx + (OR - tooth * 0.3) * Math.cos(a2)} ${cy + (OR - tooth * 0.3) * Math.sin(a2)}`,
      `L${cx + IR * Math.cos(a3)} ${cy + IR * Math.sin(a3)}`,
    ].join(' ');
  }).join(' ');
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Gear outline */}
      <Path d={`M${cx + IR} ${cy} ${gearPath} Z`} stroke={color} strokeWidth={s*0.04} fill="none" />
      {/* Centre ring */}
      <Circle cx={cx} cy={cy} r={IR * 0.62} stroke={color} strokeWidth={s*0.045} fill="none" />
      <Circle cx={cx} cy={cy} r={s*0.065} fill={color} />
      {/* Cross hair lines inside */}
      <Line x1={cx} y1={cy - IR*0.55} x2={cx} y2={cy + IR*0.55} stroke={color} strokeWidth={s*0.03} opacity={0.4} />
      <Line x1={cx - IR*0.55} y1={cy} x2={cx + IR*0.55} y2={cy} stroke={color} strokeWidth={s*0.03} opacity={0.4} />
    </Svg>
  );
}

// ── 09. SKINS — diamond crystal with colour spectrum facets ──────────────────
export function SkinsIcon({ size = 22, color = '#A468FF', active = false, dimOpacity = DIM }: IconProps) {
  const op = active ? 1 : Math.max(dimOpacity, 0.70);
  const s = size;
  const cx = s / 2, cy = s / 2;
  // Diamond facets
  const top = `${cx},${cy - s*0.42}`;
  const mid_l = `${cx - s*0.38},${cy + s*0.04}`;
  const mid_r = `${cx + s*0.38},${cy + s*0.04}`;
  const bot = `${cx},${cy + s*0.42}`;
  const ml = `${cx - s*0.18},${cy - s*0.12}`;
  const mr = `${cx + s*0.18},${cy - s*0.12}`;
  const SPECTRUM = ['#FF5FA8','#A468FF','#4A9EFF','#38D9E8','#2FE38A'];
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ opacity: op }}>
      {/* Top left facet */}
      <Polygon points={`${top} ${ml} ${mid_l}`} fill={SPECTRUM[0]} opacity={active ? 0.75 : 0.4} />
      {/* Top centre facet */}
      <Polygon points={`${top} ${mr} ${ml}`} fill={SPECTRUM[1]} opacity={active ? 0.8 : 0.45} />
      {/* Top right facet */}
      <Polygon points={`${top} ${mid_r} ${mr}`} fill={SPECTRUM[2]} opacity={active ? 0.75 : 0.4} />
      {/* Bottom left facet */}
      <Polygon points={`${mid_l} ${ml} ${bot}`} fill={SPECTRUM[3]} opacity={active ? 0.7 : 0.38} />
      {/* Bottom centre facet */}
      <Polygon points={`${ml} ${mr} ${bot}`} fill={SPECTRUM[4]} opacity={active ? 0.65 : 0.35} />
      {/* Bottom right facet */}
      <Polygon points={`${mr} ${mid_r} ${bot}`} fill={SPECTRUM[2]} opacity={active ? 0.7 : 0.38} />
      {/* Outline */}
      <Polygon
        points={`${top} ${mid_r} ${bot} ${mid_l}`}
        stroke={color} strokeWidth={s*0.055} fill="none"
      />
      {/* Waist cut line */}
      <Line x1={mid_l.split(',')[0]} y1={mid_l.split(',')[1]} x2={mid_r.split(',')[0]} y2={mid_r.split(',')[1]}
        stroke={color} strokeWidth={s*0.04} opacity={0.5} />
    </Svg>
  );
}
