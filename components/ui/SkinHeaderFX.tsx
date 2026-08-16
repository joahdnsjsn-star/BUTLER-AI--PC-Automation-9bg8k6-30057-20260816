/**
 * SkinHeaderFX — the animated layer that lives inside every page header.
 *
 * • Colours come 100% from the active skin, so switching packs on the SKINS
 *   page recolours every header instantly.
 * • The motion personality rotates (see constants/fxRotation) so the app never
 *   looks like a static screenshot two launches in a row.
 * • Native driver only (transform + opacity) — zero JS-driver colour loops,
 *   so it costs nothing on the UI thread and never fights Hermes.
 */
import React, { memo, useEffect, useRef } from 'react';
import { useFx } from '@/components/ui/Guard';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { fxDuration, fxVariantFor } from '@/constants/fxRotation';

const SW = Math.max(1, Dimensions.get('window').width || 375);

interface Props {
  accent: string;
  accent2?: string;
  accent3?: string;
  stripe?: string[];
  /** stable key so two headers never run the same loop */
  fxKey?: string;
  /** disable all motion (reduced-motion / low-power) */
  still?: boolean;
}

function SkinHeaderFXBase({ accent, accent2, accent3, stripe, fxKey = 'hdr', still = false }: Props) {
  // Sentinel motion budget: when the JS thread stalls or an error loop is
  // detected, decorative loops stand down automatically and resume later.
  const fxAllowed = useFx();
  const v = fxVariantFor(fxKey);
  const sweep = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still || !fxAllowed) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: fxDuration(2200, v),
          easing: v % 2 ? Easing.inOut(Easing.cubic) : Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(1600 + v * 700),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: fxDuration(1700, v), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: fxDuration(1700, v), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [still, fxAllowed, v, sweep, breathe]);

  const bars = stripe && stripe.length ? stripe : [accent, accent2 ?? accent, accent3 ?? accent];

  // variant 0: light sweep · 1: scan bar · 2: soft orb drift · 3: edge shimmer
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-SW * 0.6, SW * 1.1] });
  const orbX = sweep.interpolate({ inputRange: [0, 1], outputRange: [SW * 0.15, SW * 0.85] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] });
  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* base accent wash — instantly reskins with the pack */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: Animated.multiply(glowOpacity, 0.35) }]}
      />

      {v === 0 && (
        <Animated.View
          style={[fx.sweep, { backgroundColor: accent, transform: [{ translateX }, { skewX: '-18deg' }] }]}
        />
      )}

      {v === 1 && (
        <Animated.View
          style={[fx.scanline, { backgroundColor: accent2 ?? accent, transform: [{ translateX }] }]}
        />
      )}

      {v === 2 && (
        <Animated.View
          style={[fx.orb, {
            backgroundColor: accent3 ?? accent,
            opacity: glowOpacity,
            transform: [{ translateX: orbX }, { scale: orbScale }],
          }]}
        />
      )}

      {v === 3 && (
        <Animated.View
          style={[fx.edge, { backgroundColor: accent, opacity: glowOpacity, transform: [{ scaleX: orbScale }] }]}
        />
      )}

      {/* bottom micro-stripe: pure skin colours, no animation cost */}
      <View style={fx.stripe}>
        {bars.map((c, i) => (
          <View key={`${c}-${i}`} style={{ flex: 1, backgroundColor: c, opacity: 0.9 }} />
        ))}
      </View>
    </View>
  );
}

const fx = StyleSheet.create({
  sweep:    { position: 'absolute', top: 0, bottom: 0, width: 90, opacity: 0.1 },
  scanline: { position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.5 },
  orb:      { position: 'absolute', top: -20, width: 120, height: 120, borderRadius: 60 },
  edge:     { position: 'absolute', left: 0, right: 0, bottom: 2, height: 1.5 },
  stripe:   { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, flexDirection: 'row' },
});

export const SkinHeaderFX = memo(SkinHeaderFXBase);
export default SkinHeaderFX;
