/**
 * FuturisticTabBar — NEXUS DOCK v10.0 · PROFESSIONAL FLOATING PILL
 * © 2026 Andrej Sladkovic — Butler AI — ALL RIGHTS RESERVED
 *
 * Design language:
 *  • Floating rounded card with a sharp coloured top-accent that
 *    tracks the active tab — no rainbow, no noise
 *  • Each tab cell: icon centred above a 3-char label
 *  • Active state: filled pill behind the icon (tab's brand colour)
 *    with a subtle scale spring; inactive: dim icon + faint label
 *  • QuickButlerBar floats immediately above the dock when not on AI tab
 *  • Unread badge on Butler AI icon (red dot, top-right of icon)
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { haptics } from '@/services/haptics';
import { autoErrorLogger } from '@/services/autoErrorLogger';
import QuickButlerBar from '@/components/ui/QuickButlerBar';
import {
  NexusCoreIcon, ForgeScriptsIcon, ButlerAIIcon, KnowledgeBaseIcon,
  IntelLogsIcon, BuilderIcon, VaultIcon, ConfigIcon, SkinsIcon,
} from '@/components/ui/NexusTabIcons';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import { Guard } from '@/components/ui/Guard';

// ── GLOBAL AI NOTIFICATION STATE ──────────────────────────────────
let _butlerUnread = false;
const _butlerListeners: Set<() => void> = new Set();

export function notifyButlerNewMessage() {
  _butlerUnread = true;
  _butlerListeners.forEach(fn => { try { fn(); } catch (e) { autoErrorLogger?.log?.('warn', '[tabBar]', String(e)); } });
}
export function clearButlerUnread() {
  _butlerUnread = false;
  _butlerListeners.forEach(fn => { try { fn(); } catch (e) { autoErrorLogger?.log?.('warn', '[tabBar]', String(e)); } });
}
(global as any).__notifyButlerNewMessage = notifyButlerNewMessage;
(global as any).__clearButlerUnread      = clearButlerUnread;

// ── CONSTANTS ─────────────────────────────────────────────────────
const MONO: any = Platform.OS === 'ios' ? 'Courier' : 'monospace';
const ICON_SIZE = 20;
const HIDDEN_TABS = new Set(['onboarding', 'index', 'terminal', 'support']);

/** Left→right dock order. Anything unlisted sits before Settings, which is pinned last. */
const TAB_ORDER = ['nexushome', 'home', 'forge', 'scripts', 'butler', 'knowledge', 'connect', 'pair', 'repo', 'logs', 'settings'];

const TAB_ALIASES: Record<string, string> = {
  home: 'nexushome', nexushome: 'nexushome', core: 'nexushome',
  scripts: 'scripts', forge: 'scripts',
  butlr: 'butler', butler: 'butler', ai: 'butler', chat: 'butler',
  knowledge: 'knowledge', kb: 'knowledge',
  logs: 'logs', intel: 'logs',
  builder: 'builder', build: 'builder',
  fileshare: 'fileshare', vault: 'fileshare',
  settings: 'settings', config: 'settings', cfg: 'settings',
  cosmetic: 'cosmetic', themes: 'cosmetic', skins: 'cosmetic',
  connect: 'connect', pair: 'connect',
};

// Per-tab brand colours and 3-char labels
const TAB_META: Record<string, { color: string; label: string }> = {
  nexushome: { color: '#38D9E8', label: 'CORE'  },
  scripts:   { color: '#A468FF', label: 'LIB'   },
  butler:    { color: '#2FE38A', label: 'BTLR'  },
  knowledge: { color: '#4A9EFF', label: 'KB'    },
  logs:      { color: '#FFB43D', label: 'LOG'   },
  builder:   { color: '#FF7A1F', label: 'BILD'  },
  fileshare: { color: '#FF5FA8', label: 'VAULT' },
  settings:  { color: '#A468FF', label: 'CFG'   },
  cosmetic:  { color: '#A468FF', label: 'SKIN'  },
  connect:   { color: '#38D9E8', label: 'PAIR'  },
};

// Palette — matches home.tsx / knowledge.tsx exactly
const BG_CARD  = '#0B0F17';
const BORDER_C = 'rgba(0,229,255,0.18)';
const DIM_C    = 'rgba(74,104,128,0.9)';
const DIM_LBL  = 'rgba(74,104,128,0.85)';

function getColor(r: string) { return TAB_META[r]?.color ?? '#38D9E8'; }
function getLabel(r: string) { return TAB_META[r]?.label ?? r.slice(0, 4).toUpperCase(); }

// ── PAIR ICON (custom SVG for connect tab) ────────────────────────
function PairIcon({ size = 18, color = '#38D9E8' }: { size?: number; color?: string }) {
  const s = size; const cx = s / 2; const cy = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {/* QR-code corners metaphor */}
      <Rect x={cx - s*0.42} y={cy - s*0.42} width={s*0.24} height={s*0.24} rx={s*0.04}
        stroke={color} strokeWidth={s*0.07} fill="none" />
      <Rect x={cx + s*0.18} y={cy - s*0.42} width={s*0.24} height={s*0.24} rx={s*0.04}
        stroke={color} strokeWidth={s*0.07} fill="none" />
      <Rect x={cx - s*0.42} y={cy + s*0.18} width={s*0.24} height={s*0.24} rx={s*0.04}
        stroke={color} strokeWidth={s*0.07} fill="none" />
      {/* Inner filled squares */}
      <Rect x={cx - s*0.31} y={cy - s*0.31} width={s*0.10} height={s*0.10} rx={s*0.02} fill={color} opacity={0.9} />
      <Rect x={cx + s*0.21} y={cy - s*0.31} width={s*0.10} height={s*0.10} rx={s*0.02} fill={color} opacity={0.9} />
      <Rect x={cx - s*0.31} y={cy + s*0.21} width={s*0.10} height={s*0.10} rx={s*0.02} fill={color} opacity={0.9} />
      {/* Connection dot bottom-right */}
      <Circle cx={cx + s*0.30} cy={cy + s*0.30} r={s*0.13} stroke={color} strokeWidth={s*0.055} fill="none" />
      <Circle cx={cx + s*0.30} cy={cy + s*0.30} r={s*0.055} fill={color} />
    </Svg>
  );
}

function renderIcon(routeName: string, color: string, active: boolean) {
  const p = { size: ICON_SIZE, color, active, dimOpacity: 0.9 };
  switch (routeName) {
    case 'nexushome':  return <NexusCoreIcon     {...p} />;
    case 'scripts':    return <ForgeScriptsIcon  {...p} />;
    case 'butler':     return <ButlerAIIcon      {...p} />;
    case 'knowledge':  return <KnowledgeBaseIcon {...p} />;
    case 'logs':       return <IntelLogsIcon     {...p} />;
    case 'builder':    return <BuilderIcon       {...p} />;
    case 'fileshare':  return <VaultIcon         {...p} />;
    case 'settings':   return <ConfigIcon        {...p} />;
    case 'cosmetic':   return <SkinsIcon         {...p} />;
    case 'connect':    return <PairIcon size={ICON_SIZE} color={color} />;
    default:           return <ButlerAIIcon      {...p} />;
  }
}

// ── TAB ITEM ──────────────────────────────────────────────────────
interface TabItemProps {
  routeName: string;
  isFocused: boolean;
  flex: number;
  onPress: () => void;
}

const TabItem = React.memo(function TabItem({ routeName, isFocused, flex, onPress }: TabItemProps) {
  const color = getColor(routeName);
  const label = getLabel(routeName);

  const scaleA = useRef(new Animated.Value(1)).current;
  const bgA    = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelA = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  const [hasUnread, setHasUnread] = useState(_butlerUnread && routeName === 'butler');

  useEffect(() => {
    if (routeName !== 'butler') return;
    const fn = () => setHasUnread(_butlerUnread);
    _butlerListeners.add(fn); return () => { _butlerListeners.delete(fn); };
  }, [routeName]);

  useEffect(() => {
    if (isFocused && routeName === 'butler') clearButlerUnread();
  }, [isFocused, routeName]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleA, {
        toValue: isFocused ? 1.08 : 1,
        tension: 260, friction: 14, useNativeDriver: true,
      }),
      Animated.timing(bgA,    { toValue: isFocused ? 1 : 0, duration: 180, useNativeDriver: false }),
      Animated.timing(labelA, { toValue: isFocused ? 1 : 0, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [isFocused]);

  const bgColor    = bgA.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', color + '28'] });
  const borderCol  = bgA.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', color + '50'] });
  const iconColor  = isFocused ? color : DIM_C;
  const labelColor = labelA.interpolate({ inputRange: [0, 1], outputRange: [DIM_LBL, color] });

  return (
    <TouchableOpacity
      onPress={() => { haptics.light(); onPress(); }}
      activeOpacity={0.7}
      style={{ flex, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}>
      <Animated.View style={{ transform: [{ scale: scaleA }], alignItems: 'center', gap: 3 }}>
        {/* Icon pill */}
        <Animated.View style={[ti.iconPill, { backgroundColor: bgColor, borderColor: borderCol }]}>
          {renderIcon(routeName, iconColor, isFocused)}
          {/* Active dot above icon */}
          {isFocused && (
            <View style={[ti.activeLine, { backgroundColor: color }]} />
          )}
          {/* Unread badge */}
          {hasUnread && !isFocused && (
            <View style={ti.unreadDot} />
          )}
        </Animated.View>
        {/* Label */}
        <Animated.Text style={[ti.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

const ti = StyleSheet.create({
  iconPill: {
    width: 44, height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeLine: {
    position: 'absolute',
    top: -1, left: '50%', marginLeft: -12,
    width: 24, height: 2.5, borderRadius: 2,
  },
  unreadDot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: '#FF4D5E',
    borderWidth: 1.5, borderColor: BG_CARD,
  },
  label: {
    fontFamily: MONO,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

// ── MAIN TABBAR ────────────────────────────────────────────────────
export default function FuturisticTabBar(
  props: BottomTabBarProps & {
    iconMap?: Record<string, (color: string, size: number) => React.ReactNode>;
  },
) {
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();

  // Register global tab-switch helper
  useEffect(() => {
    (global as any).__butlerSwitchTab = (tab: string) => {
      const route = TAB_ALIASES[String(tab || '').toLowerCase()] || tab;
      try { navigation.navigate(route as never); } catch {}
    };
    return () => { delete (global as any).__butlerSwitchTab; };
  }, [navigation]);

  // Filter visible routes
  const visibleRoutes = useMemo(() =>
    state.routes
      .map((route, idx) => ({ route, idx }))
      .filter(({ route }) => {
        if (HIDDEN_TABS.has(route.name)) return false;
        const opts = descriptors[route.key].options as any;
        if (opts?.href === null)                                  return false;
        if (opts?.tabBarButton === null)                          return false;
        if ((opts?.tabBarItemStyle as any)?.display === 'none')  return false;
        return true;
      })
      // Explicit dock order — Settings is ALWAYS the last icon, whatever
      // order the router happens to register the screens in.
      .sort((a, b) => {
        const rank = (n: string) => {
          if (n === 'settings') return 9999;
          const i = TAB_ORDER.indexOf(n);
          return i === -1 ? 5000 : i;
        };
        return rank(a.route.name) - rank(b.route.name);
      }),
    [state.routes, descriptors],
  );

  const activeRouteName = visibleRoutes.find(r => r.idx === state.index)?.route?.name ?? 'nexushome';
  const isOnButlerTab   = activeRouteName === 'butler';
  const activeColor     = getColor(activeRouteName);
  const bottomPad       = Math.max(insets.bottom, Platform.OS === 'android' ? 4 : 0);

  return (
    <View pointerEvents="box-none" style={[dock.root, { paddingBottom: bottomPad }]}>
      {/* QuickButlerBar floats above dock (hidden on butler tab) */}
      {!isOnButlerTab && (
        <View style={dock.barWrapper} pointerEvents="box-none">
          <Guard name="ui.quickAskBar">
            <QuickButlerBar />
          </Guard>
        </View>
      )}

      {/* Floating dock card */}
      <View style={dock.card}>
        {/* Active-tab colour accent — single clean stripe */}
        <View style={[dock.accent, { backgroundColor: activeColor }]} />

        {/* Tab row */}
        <View style={dock.tabRow}>
          {visibleRoutes.map(({ route, idx }) => {
            const isFocused = state.index === idx;
            const onPress   = () => {
              const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !ev.defaultPrevented) navigation.navigate(route.name as never);
            };
            return (
              <TabItem
                key={route.key}
                routeName={route.name}
                isFocused={isFocused}
                flex={1}
                onPress={onPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const dock = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  barWrapper: {
    width: '100%',
    marginBottom: 4,
  },
  card: {
    marginHorizontal: 8,
    marginBottom: 6,
    borderRadius: 22,
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: BORDER_C,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.75,
        shadowRadius: 18,
      },
      android: { elevation: 20 },
      default: {},
    }),
  },
  accent: {
    height: 3,
    opacity: 0.95,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 6,
  },
});
