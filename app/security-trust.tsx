/**
 * Security & Trust — Butler AI
 * A concise, skimmable screen for Play Store reviewers and skeptical first-time users.
 * Explains exactly what the app does and doesn't do with data.
 */

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const SANS: any = Platform.OS === 'ios' ? 'System'    : 'sans-serif';

const C = {
  bg:       '#050810',
  surface:  '#0B0F17',
  card:     '#111621',
  cyan:     '#38D9E8',
  green:    '#2FE38A',
  amber:    '#FFB43D',
  purple:   '#A468FF',
  teal:     '#38D9E8',
  red:      '#FF4D5E',
  text:     '#4A9EFF',
  textMid:  '#4A9EFF',
  textDim:  '#4A9EFF',
  border:   'rgba(0,229,255,0.12)',
};

let SHIELD_IMG: any = null;
try { SHIELD_IMG = require('@/assets/images/mascot_shield.png'); } catch {
  try { SHIELD_IMG = require('@/assets/images/mascot_shield_v2.png'); } catch {}
}

interface TrustCard {
  icon: string;
  iconLib: 'material' | 'community';
  title: string;
  claim: string;
  detail: string;
  color: string;
}

const TRUST_CARDS: TrustCard[] = [
  {
    icon: 'cloud-off',
    iconLib: 'material',
    title: 'No cloud, ever',
    claim: 'Every request stays on your WiFi.',
    detail: 'Your phone talks only to your own PC over the local area network. No traffic is routed through any external server. No company cloud, no relay node, no intermediary.',
    color: C.cyan,
  },
  {
    icon: 'eye-off-outline',
    iconLib: 'community',
    title: 'No accounts, no tracking',
    claim: 'Nothing to sign up for. Nothing to track.',
    detail: 'No analytics SDKs, no ad ID, no crash reporting, no background network calls to any host outside your own PC\'s IP address. We have no server to receive your data.',
    color: C.green,
  },
  {
    icon: 'gesture-tap-button',
    iconLib: 'community',
    title: 'You control every action',
    claim: 'Nothing runs without a tap.',
    detail: 'Every script execution requires a manual confirmation. The app\'s own safety scanner — running both on-device and server-side — checks commands before execution and rejects destructive patterns automatically.',
    color: C.amber,
  },
  {
    icon: 'database-lock-outline',
    iconLib: 'community',
    title: 'Your data, your device',
    claim: 'Delete anytime. No waiting, no request form.',
    detail: 'All stored data (server config, session token, AI chat history, knowledge base) lives in your phone\'s encrypted storage. Settings → Reset All Data removes everything instantly.',
    color: C.purple,
  },
  {
    icon: 'lock-outline',
    iconLib: 'community',
    title: 'Hardware-encrypted credentials',
    claim: 'Session tokens use device-backed encryption.',
    detail: 'Your PC server\'s session token and pairing credentials are stored using hardware-backed encrypted storage (Android Keystore / iOS Keychain). They cannot be read by other apps, even on a rooted device.',
    color: C.teal,
  },
  {
    icon: 'shield-check-outline',
    iconLib: 'community',
    title: 'Play Store compliant',
    claim: 'Every permission is used only for its declared purpose.',
    detail: 'Camera → QR code pairing only (user tap required). Local network → LAN communication with your PC only. No background data collection. No READ_CONTACTS, no location tracking, no ACTIVITY_RECOGNITION.',
    color: C.green,
  },
];

interface PermRow {
  name: string;
  reason: string;
  risk: 'LOW' | 'NONE';
}

const PERMISSIONS: PermRow[] = [
  { name: 'CAMERA',              reason: 'QR code scanner for server pairing — triggered by user tap only',         risk: 'LOW'  },
  { name: 'LOCAL NETWORK',       reason: 'LAN communication with butler_server.py on your PC only',                risk: 'LOW'  },
  { name: 'INTERNET',            reason: 'All calls go to your PC server on LAN — no internet destinations',       risk: 'NONE' },
  { name: 'VIBRATE',             reason: 'Haptic feedback on button presses',                                       risk: 'NONE' },
  { name: 'NOTIFICATIONS',       reason: 'Digital Twin security alerts from your own PC',                          risk: 'LOW'  },
  { name: 'BIOMETRIC',           reason: 'Optional vault protection in Settings — never required',                  risk: 'LOW'  },
];

function PermBadge({ risk }: { risk: 'LOW' | 'NONE' }) {
  const color = risk === 'NONE' ? C.green : C.amber;
  return (
    <View style={{ borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
      borderColor: color + '55', backgroundColor: color + '10' }}>
      <Text style={{ fontFamily: MONO, fontSize: 8, fontWeight: '900', color, letterSpacing: 0.5 }}>
        RISK: {risk}
      </Text>
    </View>
  );
}

export default function SecurityTrustScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}
          style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={20} color={C.cyan} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>BUTLER AI</Text>
          <Text style={s.headerTitle}>SECURITY & TRUST</Text>
        </View>
        <View style={[s.badge, { borderColor: C.green + '50', backgroundColor: C.green + '0C' }]}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.green }} />
          <Text style={{ fontFamily: MONO, fontSize: 8, fontWeight: '900', color: C.green }}>VERIFIED</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100, paddingTop: 8 }}
      >
        {/* Hero */}
        <View style={s.heroCard}>
          <View style={{ height: 3, flexDirection: 'row' }}>
            {[C.cyan, C.green, C.purple, C.amber, C.teal].map((c, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: c }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 }}>
            {SHIELD_IMG ? (
              <Image source={SHIELD_IMG} style={{ width: 64, height: 64, borderRadius: 12 }}
                contentFit="contain" />
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 14, borderWidth: 2, borderColor: C.green + '50',
                backgroundColor: C.green + '0C', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="shield-check" size={32} color={C.green} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: '700', color: C.green + '80',
                letterSpacing: 2, marginBottom: 4 }}>PRIVACY FIRST</Text>
              <Text style={{ fontFamily: SANS, fontSize: 16, fontWeight: '700', color: '#FFF', lineHeight: 22 }}>
                Your data stays{' '}
                <Text style={{ color: C.green, fontWeight: '900' }}>yours.</Text>
              </Text>
              <Text style={{ fontFamily: SANS, fontSize: 12, color: C.textMid, lineHeight: 18, marginTop: 4 }}>
                No cloud. No tracking. No exceptions. Butler AI is designed from the ground up with privacy as a non-negotiable requirement.
              </Text>
            </View>
          </View>
        </View>

        {/* Trust cards */}
        <Text style={s.sectionHdr}>WHAT WE DO — AND DON&apos;T DO</Text>
        {TRUST_CARDS.map((card, i) => {
          const Icon = card.iconLib === 'community' ? MaterialCommunityIcons : MaterialIcons;
          return (
            <View key={i} style={[s.trustCard, { borderColor: card.color + '35' }]}>
              <View style={{ height: 2, backgroundColor: card.color }} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1.5,
                  borderColor: card.color + '50', backgroundColor: card.color + '10',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={card.icon as any} size={18} color={card.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: card.color,
                    letterSpacing: 0.3, marginBottom: 3 }}>{card.title}</Text>
                  <Text style={{ fontFamily: SANS, fontSize: 13, fontWeight: '600', color: '#FFF',
                    lineHeight: 19, marginBottom: 5 }}>{card.claim}</Text>
                  <Text style={{ fontFamily: SANS, fontSize: 12, color: C.textMid, lineHeight: 18 }}>
                    {card.detail}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Android permissions table */}
        <Text style={s.sectionHdr}>ANDROID PERMISSIONS</Text>
        <View style={s.permCard}>
          <View style={{ height: 2.5, backgroundColor: C.cyan }} />
          <View style={{ padding: 14, gap: 0 }}>
            {PERMISSIONS.map((p, i) => (
              <View key={i} style={[s.permRow, i < PERMISSIONS.length - 1 && s.permBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '900', color: C.text,
                    letterSpacing: 0.3, marginBottom: 3 }}>{p.name}</Text>
                  <Text style={{ fontFamily: SANS, fontSize: 11, color: C.textMid, lineHeight: 16 }}>
                    {p.reason}
                  </Text>
                </View>
                <PermBadge risk={p.risk} />
              </View>
            ))}
            <Text style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 10, lineHeight: 15 }}>
              No other permissions are requested. No READ_CONTACTS, no READ_CALL_LOG, no ACTIVITY_RECOGNITION, no location.
            </Text>
          </View>
        </View>

        {/* Zero telemetry */}
        <Text style={s.sectionHdr}>ZERO TELEMETRY</Text>
        <View style={[s.trustCard, { borderColor: C.green + '35' }]}>
          <View style={{ height: 2, backgroundColor: C.green }} />
          <View style={{ padding: 14, gap: 10 }}>
            {[
              { icon: 'chart-bar-stacked', label: 'No analytics SDK', detail: 'No Firebase Analytics, Mixpanel, Amplitude, or equivalent' },
              { icon: 'bug-check-outline', label: 'No crash reporting', detail: 'No Sentry, Crashlytics, or any crash-report endpoint' },
              { icon: 'account-off-outline', label: 'No user profiles', detail: 'No sign-up, no email, no user ID stored on any server' },
              { icon: 'wifi-off', label: 'No background calls', detail: 'App makes zero network requests to any host other than your PC\'s LAN IP' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <MaterialCommunityIcons name={item.icon as any} size={15} color={C.green} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '900', color: C.green,
                    letterSpacing: 0.2 }}>{item.label}</Text>
                  <Text style={{ fontFamily: SANS, fontSize: 11, color: C.textMid, lineHeight: 16, marginTop: 1 }}>
                    {item.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Works offline */}
        <View style={[s.trustCard, { borderColor: C.teal + '35', marginTop: 0 }]}>
          <View style={{ height: 2, backgroundColor: C.teal }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
            <MaterialCommunityIcons name="wifi-off" size={22} color={C.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '900', color: C.teal,
                letterSpacing: 0.3, marginBottom: 3 }}>Works offline</Text>
              <Text style={{ fontFamily: SANS, fontSize: 12, color: C.textMid, lineHeight: 18 }}>
                Full AI functionality without internet. The OFFLINE mode badge in-app confirms local operation. Ollama AI model runs on your own hardware.
              </Text>
            </View>
          </View>
        </View>

        {/* Compliance footer */}
        <View style={s.complianceBox}>
          <MaterialCommunityIcons name="check-decagram" size={28} color={C.green} />
          <Text style={s.complianceTitle}>Fully Compliant</Text>
          <Text style={s.complianceSub}>
            Butler AI follows all Google Play Store policies for automation and remote control applications. Accepted on the Play Store after full manual review.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 2, borderBottomColor: C.cyan + '25',
    backgroundColor: '#070A10',
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: C.cyan + '40',
    backgroundColor: C.cyan + '0C', alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontFamily: MONO, fontSize: 8, fontWeight: '700', color: C.cyan + '70', letterSpacing: 2 },
  headerTitle: { fontFamily: MONO, fontSize: 16, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 5 },
  sectionHdr: { fontFamily: MONO, fontSize: 9, fontWeight: '900', color: C.cyan + '80',
    letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  heroCard: { borderRadius: 16, borderWidth: 2, borderColor: C.green + '40', backgroundColor: '#070A10',
    overflow: 'hidden', marginBottom: 8,
    ...Platform.select({ ios: { shadowColor: C.green, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 18 }, android: { elevation: 8 } }) },
  trustCard: { borderRadius: 14, borderWidth: 1.5, backgroundColor: C.card,
    overflow: 'hidden', marginBottom: 8,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 } }) },
  permCard: { borderRadius: 14, borderWidth: 1.5, borderColor: C.cyan + '35', backgroundColor: C.card,
    overflow: 'hidden', marginBottom: 8,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 } }) },
  permRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  permBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  complianceBox: { alignItems: 'center', paddingVertical: 24, gap: 8, marginTop: 8,
    borderWidth: 1.5, borderRadius: 16, borderColor: C.green + '35', backgroundColor: C.green + '05' },
  complianceTitle: { fontFamily: MONO, fontSize: 18, fontWeight: '900', color: C.green, letterSpacing: 1 },
  complianceSub: { fontFamily: SANS, fontSize: 12, color: C.textMid, lineHeight: 18, textAlign: 'center',
    paddingHorizontal: 20 },
});
