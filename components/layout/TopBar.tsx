/**
 * TopBar — BUTLER AI compact header bar
 * ──────────────────────────────────────────────────────────────
 * Shows brand badge, connection LED, and optional action buttons.
 * Designed to sit at the very top of any screen below SafeAreaView.
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, FONT, TYPE, glow, hex } from '@/constants/tokens';
import { haptics } from '@/services/haptics';

export interface TopBarProps {
  isConnected: boolean;
  serverAddr?: string;
  latencyMs?: number;
  onQRPress?: () => void;
  onRefreshPress?: () => void;
  /** Extra right-side action(s) */
  rightExtra?: React.ReactNode;
  /** Hides the bottom border */
  noBorder?: boolean;
}

function StatusLED({ connected }: { connected: boolean }) {
  const a = useRef(new Animated.Value(0.35)).current;
  const m = useRef(true);
  useEffect(() => {
    m.current = true;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1,    duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.15, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { m.current = false; loop.stop(); };
  }, []);
  const color = connected ? COLOR.green : COLOR.red;
  return (
    <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: a }} />
  );
}

export function TopBar({
  isConnected,
  serverAddr,
  latencyMs,
  onQRPress,
  onRefreshPress,
  rightExtra,
  noBorder = false,
}: TopBarProps) {
  const cc = isConnected ? COLOR.green : COLOR.red;

  return (
    <View style={[s.root, noBorder && { borderBottomWidth: 0 }]}>
      {/* ── BRAND BADGE ── */}
      <View style={[s.brandBadge, { borderColor: hex(COLOR.cyan, '45'), backgroundColor: glow(COLOR.cyan, 7) }]}>
        <MaterialCommunityIcons name="robot-happy-outline" size={13} color={COLOR.cyan} />
        <Text style={[s.brandTxt, { color: COLOR.cyan }]}>BUTLER</Text>
        <Text style={[s.brandSub, { color: hex(COLOR.cyan, '60') }]}>AI</Text>
      </View>

      {/* ── CONNECTION STATUS ── */}
      <View style={s.statusRow}>
        <StatusLED connected={isConnected} />
        <Text style={[s.statusTxt, { color: cc }]} numberOfLines={1}>
          {isConnected ? (serverAddr || 'CONNECTED') : 'OFFLINE'}
        </Text>
        {isConnected && latencyMs != null && latencyMs > 0 && (
          <View style={[s.latBadge, { borderColor: hex(COLOR.mid, '40') }]}>
            <Text style={{ fontFamily: FONT.mono, fontSize: 7, color: COLOR.mid }}>{latencyMs}ms</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* ── ACTION BUTTONS ── */}
      {onQRPress && (
        <TouchableOpacity
          onPress={() => { haptics.heavy(); onQRPress(); }}
          style={[s.iconBtn, { borderColor: hex(COLOR.cyan, '55'), backgroundColor: glow(COLOR.cyan, 8) }]}
          activeOpacity={0.8}
        >
          <MaterialIcons name="qr-code-scanner" size={15} color={COLOR.cyan} />
        </TouchableOpacity>
      )}

      {onRefreshPress && (
        <TouchableOpacity
          onPress={() => { haptics.light(); onRefreshPress(); }}
          style={[s.iconBtn, { borderColor: hex(COLOR.mid, '35') }]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="refresh" size={15} color={COLOR.mid} />
        </TouchableOpacity>
      )}

      {rightExtra}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#050810',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.10)',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  brandTxt: { fontFamily: FONT.mono, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  brandSub: { fontFamily: FONT.mono, fontSize: 9,  fontWeight: '700' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
    maxWidth: 160,
  },
  statusTxt: { fontFamily: FONT.mono, fontSize: 8.5, fontWeight: '700', flexShrink: 1 },
  latBadge:  { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TopBar;
