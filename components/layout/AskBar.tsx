/**
 * AskBar — Floating AI command dock
 * ──────────────────────────────────────────────────────────────
 * Fixed bottom floating bar to quick-launch Butler AI chat.
 * Renders ABOVE the tab bar (zIndex 200). Parent must NOT be
 * inside a ScrollView — place it at the screen root level.
 *
 * Usage:
 *   <AskBar onPress={() => goToTab('butler')} isConnected={isConn} />
 */

import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Platform,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR, FONT, glow, hex } from '@/constants/tokens';
import { haptics } from '@/services/haptics';

export interface AskBarProps {
  /** Taps open AI chat tab or trigger a callback */
  onPress: () => void;
  isConnected?: boolean;
  /** Override the placeholder text */
  placeholder?: string;
  /** Bottom offset above the tab bar (default auto from safe area) */
  bottomOffset?: number;
}

export function AskBar({
  onPress,
  isConnected = false,
  placeholder = 'Ask Butler AI anything…',
  bottomOffset,
}: AskBarProps) {
  const insets = useSafeAreaInsets();
  const glowA  = useRef(new Animated.Value(0.3)).current; // JS driver — borderColor only
  const m      = useRef(true);

  useEffect(() => {
    m.current = true;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glowA, { toValue: 1,   duration: 1800, useNativeDriver: false }),
      Animated.timing(glowA, { toValue: 0.2, duration: 1800, useNativeDriver: false }),
    ]));
    loop.start();
    return () => { m.current = false; loop.stop(); };
  }, []);

  const borderColor = glowA.interpolate({
    inputRange:  [0.2, 1],
    outputRange: [hex(COLOR.cyan, '28'), hex(COLOR.cyan, '88')],
  });

  const bottom = bottomOffset ?? (insets.bottom + 72); // 72 = typical tab bar height

  return (
    <Animated.View style={[s.floatWrap, { bottom, borderColor }]}>
      <TouchableOpacity
        onPress={() => { haptics.heavy(); onPress(); }}
        activeOpacity={0.88}
        style={s.bar}
      >
        {/* Bot avatar */}
        <View style={[s.avatar, { borderColor: hex(COLOR.cyan, '60'), backgroundColor: glow(COLOR.cyan, 10) }]}>
          <MaterialCommunityIcons name="robot-happy-outline" size={16} color={COLOR.cyan} />
          {/* Online indicator */}
          <View style={[
            s.avatarDot,
            { backgroundColor: isConnected ? COLOR.green : COLOR.mid, borderColor: COLOR.surf },
          ]} />
        </View>

        {/* Placeholder text */}
        <Text style={s.placeholder} numberOfLines={1}>{placeholder}</Text>

        {/* Right: shortcut chip */}
        <View style={[s.chip, { borderColor: hex(COLOR.cyan, '40'), backgroundColor: glow(COLOR.cyan, 8) }]}>
          <MaterialCommunityIcons name="robot-happy" size={12} color={COLOR.cyan} />
          <Text style={[s.chipTxt, { color: COLOR.cyan }]}>ASK</Text>
          <MaterialIcons name="arrow-forward" size={10} color={COLOR.cyan} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderWidth: 1.5,
    borderRadius: 18,
    backgroundColor: COLOR.surf,
    overflow: 'hidden',
    zIndex: 200,
    ...Platform.select({
      ios:     { shadowColor: COLOR.cyan, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  avatarDot: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  placeholder: {
    fontFamily: FONT.mono,
    fontSize: 11,
    color: COLOR.mid,
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  chipTxt: {
    fontFamily: FONT.mono,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default AskBar;
