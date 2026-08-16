/**
 * GitHubUpdateBanner — live "your app just got an update" strip.
 * Skin-wired, animated, zero new dependencies.
 * © 2026 Andrej Sladkovic — ALL RIGHTS RESERVED
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSkin } from '@/hooks/useSkin';
import { otaUpdates, type UpdateInfo } from '@/services/otaUpdates';
import { haptics } from '@/services/haptics';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

function GitHubUpdateBannerBase() {
  const S = useSkin();
  const [st, setSt] = useState<UpdateInfo>(otaUpdates.getState());
  const slide = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => otaUpdates.subscribe(setSt), []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: st.available ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [st.available]);

  useEffect(() => {
    if (!st.available) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shine, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(2200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [st.available]);

  if (!st.available) return null;

  const C = S.ok;
  return (
    <Animated.View
      style={[
        B.root,
        {
          borderColor: C + '55',
          backgroundColor: C + '10',
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          B.shine,
          {
            backgroundColor: C + '14',
            transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-160, 460] }) }],
          },
        ]}
      />
      <MaterialCommunityIcons name="cloud-download-outline" size={18} color={C} />
      <View style={{ flex: 1 }}>
        <Text style={[B.title, { color: C }]}>
          {st.source === 'expo' ? 'LIVE BUILD READY' : 'GITHUB UPDATE'}{st.short ? ` · ${st.short}` : ''}
        </Text>
        <Text numberOfLines={1} style={[B.sub, { color: S.mid }]}>
          {st.message || 'A newer revision is on your repo'}
        </Text>
      </View>
      <Pressable
        onPress={() => { haptics.medium?.(); otaUpdates.apply(); }}
        style={({ pressed }) => [B.btn, { borderColor: C, backgroundColor: C + (pressed ? '30' : '18') }]}
      >
        <Text style={[B.btnTxt, { color: C }]}>{st.applying ? '···' : st.source === 'expo' ? 'INSTALL' : 'GOT IT'}</Text>
      </Pressable>
      <Pressable onPress={() => { haptics.light?.(); otaUpdates.dismiss(); }} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={15} color={S.dim} />
      </Pressable>
    </Animated.View>
  );
}

const B = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9,
    overflow: 'hidden',
  },
  shine: { position: 'absolute', top: 0, bottom: 0, width: 90 },
  title: { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sub: { fontFamily: MONO, fontSize: 8.5, marginTop: 1 },
  btn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  btnTxt: { fontFamily: MONO, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});

export const GitHubUpdateBanner = memo(GitHubUpdateBannerBase);
export default GitHubUpdateBanner;
