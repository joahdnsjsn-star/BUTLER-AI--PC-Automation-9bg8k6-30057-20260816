/**
 * MicroCopy — the small-print layer.
 * Three locked-down text roles: SectionKicker, TipLine, FootNote.
 */
import React from 'react';
import { Text, View, Platform, TextStyle, ViewStyle } from 'react-native';

const MONO: any = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const MUTED = '#4A9EFF';
const TEXT  = '#4A9EFF';

export function SectionKicker({ children, color = MUTED, style }: {
  children: string; color?: string; style?: TextStyle;
}) {
  return (
    <Text style={[{
      fontFamily: MONO, fontSize: 7, letterSpacing: 2,
      color, textTransform: 'uppercase', marginBottom: 3,
    }, style]}>
      {children}
    </Text>
  );
}

export function TipLine({ children, color = TEXT, style }: {
  children: string; color?: string; style?: ViewStyle;
}) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'flex-start',
      gap: 5, marginTop: 8, paddingHorizontal: 2,
    }, style]}>
      <Text style={{ fontFamily: MONO, fontSize: 9, color, marginTop: 1 }}>{'✦'}</Text>
      <Text style={{
        fontFamily: MONO, fontSize: 9, lineHeight: 13,
        color, letterSpacing: 0.3, flex: 1,
      }}>
        {children}
      </Text>
    </View>
  );
}

export function FootNote({ children, style }: {
  children: string; style?: ViewStyle;
}) {
  return (
    <View style={[{ marginTop: 6, paddingHorizontal: 2 }, style]}>
      <Text style={{
        fontFamily: MONO, fontSize: 7.5, lineHeight: 11,
        color: MUTED, letterSpacing: 0.5,
      }}>
        {'\u00B7 '}{children}
      </Text>
    </View>
  );
}
