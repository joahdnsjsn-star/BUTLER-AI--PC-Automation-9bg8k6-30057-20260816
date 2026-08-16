/**
 * 🎨 COSMETIC CONTEXT — Full App Theme Provider v8.0
 * True app-wide color theming: every page, every component, every accent.
 * 12 theme packs, real applyPack, preview mode, persisted across restarts.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated } from 'react-native';

// ─── PACK EXTRAS ────────────────────────────────────────────────
export interface PackExtras {
  notifSound:  'none' | 'chime' | 'pulse' | 'blip' | 'synth';
  bubbleAnim:  'none' | 'slide' | 'pop' | 'fade' | 'glow';
  sendEffect:  'none' | 'ripple' | 'flash' | 'pulse';
  headerGlow:  boolean;
  tabPulse:    boolean;
  typingStyle: 'dots' | 'wave' | 'pulse' | 'scan';
  chatShimmer: boolean;
}

const DEFAULT_EXTRAS: PackExtras = {
  notifSound:  'chime',
  bubbleAnim:  'slide',
  sendEffect:  'ripple',
  headerGlow:  true,
  tabPulse:    true,
  typingStyle: 'dots',
  chatShimmer: false,
};

// ─── FULL THEME DEFINITION ───────────────────────────────────────
export interface AppTheme {
  id: string;
  name: string;
  // Core palette
  primary: string;
  secondary: string;
  tertiary: string;
  // Backgrounds
  bg: string;
  panel: string;
  panelBrt: string;
  // Text
  textAccent: string;
  textDim: string;
  textHi: string;
  textMid?: string;
  // Glows & borders
  glowColor: string;
  borderColor: string;
  borderBrt: string;
  // Chat
  userBubble: string;
  aiBubble: string;
  aiBorder: string;
  chatBarBg: string;
  chatBarTopGlow: string;
  chatBarBorderTop: string;
  promptGlyph: string;
  // Meta
  isDefault: boolean;
  tagline?: string;
  category?: string;
  icon?: string;
  badge?: string;
  defaultExtras?: Partial<PackExtras>;
  // Tier info
  tier?: 'free' | 'supporter' | 'pro' | 'elite';
}

// ─── THEME PACKS ────────────────────────────────────────────────
export const PACK_THEMES: Record<string, AppTheme> = {

  nexus: {
    id: 'nexus', name: 'NEXUS CORE', isDefault: true, tier: 'free',
    tagline: 'Professional command grid — electric blue · violet sweep', category: 'SYSTEM',
    icon: 'hexagon-outline', badge: 'DEFAULT',
    // NEXUS v5 palette — extracted from nexus-ultimate-v5 mockup
    primary: '#4A9EFF', secondary: '#A468FF', tertiary: '#FFB43D',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#4A9EFF',
    textAccent: '#4A9EFF', textDim: '#4A9EFF', textHi: '#DCE6F2', textMid: '#9DAABE',
    glowColor: '#4A9EFF', borderColor: '#4A9EFF', borderBrt: '#4A9EFF',
    userBubble: '#4A9EFF', aiBubble: '#0B0F17', aiBorder: 'rgba(59,130,246,0.22)',
    chatBarBg: '#0B0F17', chatBarTopGlow: '#4A9EFF', chatBarBorderTop: 'rgba(59,130,246,0.32)',
    promptGlyph: '#4A9EFF',
    defaultExtras: { notifSound: 'chime', bubbleAnim: 'slide', sendEffect: 'ripple', headerGlow: true, tabPulse: true, typingStyle: 'dots', chatShimmer: false },
  },

  cobalt: {
    id: 'cobalt', name: 'COBALT DEPTH', isDefault: false, tier: 'supporter',
    tagline: 'Deep ocean intelligence system', category: 'DARK',
    icon: 'waves',
    primary: '#4A9EFF', secondary: '#4A9EFF', tertiary: '#4A9EFF',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#4A9EFF',
    textAccent: '#4A9EFF', textDim: '#4A9EFF', textHi: '#F4F8FF', textMid: '#4A9EFF',
    glowColor: '#4A9EFF', borderColor: '#4A9EFF', borderBrt: '#4A9EFF',
    userBubble: '#4A9EFF', aiBubble: '#070A10', aiBorder: 'rgba(68,136,255,0.22)',
    chatBarBg: '#070A10', chatBarTopGlow: '#4A9EFF', chatBarBorderTop: 'rgba(68,136,255,0.30)',
    promptGlyph: '#4A9EFF',
    defaultExtras: { notifSound: 'chime', bubbleAnim: 'slide', sendEffect: 'ripple', headerGlow: true, tabPulse: true, typingStyle: 'dots', chatShimmer: false },
  },

  titanium: {
    id: 'titanium', name: 'TITANIUM GREY', isDefault: false, tier: 'supporter',
    tagline: 'Monochrome precision control', category: 'DARK',
    icon: 'shield-half-full',
    primary: '#9DAABE', secondary: '#6B7A92', tertiary: '#DCE6F2',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#161C28',
    textAccent: '#C3CFDF', textDim: '#4A9EFF', textHi: '#F4F8FF', textMid: '#6B7A92',
    glowColor: '#9DAABE', borderColor: '#6B7A92', borderBrt: '#DCE6F2',
    userBubble: '#4A9EFF', aiBubble: '#070A10', aiBorder: 'rgba(170,187,204,0.22)',
    chatBarBg: '#050810', chatBarTopGlow: '#9DAABE', chatBarBorderTop: 'rgba(170,187,204,0.28)',
    promptGlyph: '#9DAABE',
    defaultExtras: { notifSound: 'none', bubbleAnim: 'fade', sendEffect: 'none', headerGlow: false, tabPulse: false, typingStyle: 'dots', chatShimmer: false },
  },

  void: {
    id: 'void', name: 'VOID PROTOCOL', isDefault: false, tier: 'supporter',
    tagline: 'Absolute dark minimal system', category: 'SYSTEM',
    icon: 'circle-outline',
    primary: '#DCE6F2', secondary: '#6B7A92', tertiary: '#C3CFDF',
    bg: '#000000', panel: '#050810', panelBrt: '#0B0F17',
    textAccent: '#FFFFFF', textDim: '#2A3242', textHi: '#FFFFFF', textMid: '#6B7A92',
    glowColor: '#FFFFFF', borderColor: '#3A4356', borderBrt: '#9DAABE',
    userBubble: '#111621', aiBubble: '#050810', aiBorder: 'rgba(255,255,255,0.15)',
    chatBarBg: '#050810', chatBarTopGlow: '#DCE6F2', chatBarBorderTop: 'rgba(255,255,255,0.18)',
    promptGlyph: '#DCE6F2',
    defaultExtras: { notifSound: 'none', bubbleAnim: 'none', sendEffect: 'none', headerGlow: false, tabPulse: false, typingStyle: 'dots', chatShimmer: false },
  },

  solar: {
    id: 'solar', name: 'SOLAR FLARE', isDefault: false, tier: 'pro',
    tagline: 'Amber-gold power interface', category: 'WARM',
    icon: 'white-balance-sunny',
    primary: '#FFB43D', secondary: '#FFC94A', tertiary: '#FF7A1F',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#0B0F17',
    textAccent: '#FFB43D', textDim: '#FFB43D', textHi: '#F4F8FF', textMid: '#FFB43D',
    glowColor: '#FFB43D', borderColor: '#FF7A1F', borderBrt: '#FFB43D',
    userBubble: '#FF7A1F', aiBubble: '#050810', aiBorder: 'rgba(255,140,0,0.30)',
    chatBarBg: '#050810', chatBarTopGlow: '#FFB43D', chatBarBorderTop: 'rgba(255,140,0,0.35)',
    promptGlyph: '#FFB43D',
    defaultExtras: { notifSound: 'blip', bubbleAnim: 'pop', sendEffect: 'flash', headerGlow: true, tabPulse: true, typingStyle: 'dots', chatShimmer: false },
  },

  sakura: {
    id: 'sakura', name: 'SAKURA NEON', isDefault: false, tier: 'pro',
    tagline: 'Pink blossom cyber aesthetic', category: 'WARM',
    icon: 'flower', badge: 'HOT',
    primary: '#FF5FA8', secondary: '#FF5FA8', tertiary: '#FF5FA8',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#FF5FA8',
    textAccent: '#FF5FA8', textDim: '#FF5FA8', textHi: '#F4F8FF', textMid: '#FF5FA8',
    glowColor: '#FF5FA8', borderColor: '#FF5FA8', borderBrt: '#FF5FA8',
    userBubble: '#FF5FA8', aiBubble: '#050810', aiBorder: 'rgba(255,110,180,0.25)',
    chatBarBg: '#050810', chatBarTopGlow: '#FF5FA8', chatBarBorderTop: 'rgba(255,110,180,0.32)',
    promptGlyph: '#FF5FA8',
    defaultExtras: { notifSound: 'chime', bubbleAnim: 'pop', sendEffect: 'ripple', headerGlow: true, tabPulse: true, typingStyle: 'wave', chatShimmer: true },
  },

  matrix: {
    id: 'matrix', name: 'MATRIX GREEN', isDefault: false, tier: 'pro',
    tagline: 'Classic terminal hacker mode', category: 'SYSTEM',
    icon: 'code-brackets',
    primary: '#2FE38A', secondary: '#2FE38A', tertiary: '#2FE38A',
    bg: '#050810', panel: '#070A10', panelBrt: '#0B0F17',
    textAccent: '#2FE38A', textDim: '#2FE38A', textHi: '#F4F8FF', textMid: '#2FE38A',
    glowColor: '#2FE38A', borderColor: '#2FE38A', borderBrt: '#2FE38A',
    userBubble: '#2FE38A', aiBubble: '#050810', aiBorder: 'rgba(0,255,68,0.22)',
    chatBarBg: '#050810', chatBarTopGlow: '#2FE38A', chatBarBorderTop: 'rgba(0,255,68,0.30)',
    promptGlyph: '#2FE38A',
    defaultExtras: { notifSound: 'blip', bubbleAnim: 'slide', sendEffect: 'ripple', headerGlow: true, tabPulse: false, typingStyle: 'scan', chatShimmer: false },
  },

  aurora: {
    id: 'aurora', name: 'AURORA BOREALIS', isDefault: false, tier: 'pro',
    tagline: 'Northern lights gradient system', category: 'NEON',
    icon: 'weather-night', badge: 'POPULAR',
    primary: '#2FE38A', secondary: '#A468FF', tertiary: '#4A9EFF',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#111621',
    textAccent: '#2FE38A', textDim: '#2FE38A', textHi: '#F4F8FF', textMid: '#2FE38A',
    glowColor: '#2FE38A', borderColor: '#2FE38A', borderBrt: '#2FE38A',
    userBubble: '#2FE38A', aiBubble: '#050810', aiBorder: 'rgba(0,255,178,0.22)',
    chatBarBg: '#050810', chatBarTopGlow: '#2FE38A', chatBarBorderTop: 'rgba(0,255,178,0.30)',
    promptGlyph: '#2FE38A',
    defaultExtras: { notifSound: 'chime', bubbleAnim: 'fade', sendEffect: 'ripple', headerGlow: true, tabPulse: true, typingStyle: 'wave', chatShimmer: true },
  },

  phantom: {
    id: 'phantom', name: 'PHANTOM RED', isDefault: false, tier: 'elite',
    tagline: 'Blood-dark stealth ops palette', category: 'DARK',
    icon: 'ghost',
    primary: '#FF4D5E', secondary: '#FF4D5E', tertiary: '#FF4D5E',
    bg: '#050810', panel: '#070A10', panelBrt: '#0B0F17',
    textAccent: '#FF4D5E', textDim: '#FF4D5E', textHi: '#F4F8FF', textMid: '#FF5FA8',
    glowColor: '#FF4D5E', borderColor: '#FF4D5E', borderBrt: '#FF4D5E',
    userBubble: '#FF4D5E', aiBubble: '#050810', aiBorder: 'rgba(255,51,85,0.30)',
    chatBarBg: '#050810', chatBarTopGlow: '#FF4D5E', chatBarBorderTop: 'rgba(255,51,85,0.35)',
    promptGlyph: '#FF4D5E',
    defaultExtras: { notifSound: 'pulse', bubbleAnim: 'glow', sendEffect: 'pulse', headerGlow: true, tabPulse: true, typingStyle: 'scan', chatShimmer: false },
  },

  sigma: {
    id: 'sigma', name: 'SIGMA-NET', isDefault: false, tier: 'elite',
    tagline: 'Protocol purple crawler mode', category: 'NEON',
    icon: 'network', badge: 'NEW',
    primary: '#A468FF', secondary: '#A468FF', tertiary: '#FF5FA8',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#A468FF',
    textAccent: '#A468FF', textDim: '#A468FF', textHi: '#F4F8FF', textMid: '#A468FF',
    glowColor: '#A468FF', borderColor: '#A468FF', borderBrt: '#A468FF',
    userBubble: '#A468FF', aiBubble: '#050810', aiBorder: 'rgba(204,51,255,0.30)',
    chatBarBg: '#050810', chatBarTopGlow: '#A468FF', chatBarBorderTop: 'rgba(204,51,255,0.35)',
    promptGlyph: '#A468FF',
    defaultExtras: { notifSound: 'synth', bubbleAnim: 'fade', sendEffect: 'flash', headerGlow: true, tabPulse: true, typingStyle: 'pulse', chatShimmer: true },
  },

  quantum: {
    id: 'quantum', name: 'QUANTUM GOLD', isDefault: false, tier: 'elite',
    tagline: 'Luxury frequency intelligence', category: 'WARM',
    icon: 'atom', badge: 'ELITE',
    primary: '#FFC94A', secondary: '#FFC94A', tertiary: '#FFC94A',
    bg: '#050810', panel: '#050810', panelBrt: '#0B0F17',
    textAccent: '#FFC94A', textDim: '#FFC94A', textHi: '#DCE6F2', textMid: '#FFB43D',
    glowColor: '#FFC94A', borderColor: '#FFC94A', borderBrt: '#FFC94A',
    userBubble: '#FFC94A', aiBubble: '#050810', aiBorder: 'rgba(255,215,0,0.28)',
    chatBarBg: '#050810', chatBarTopGlow: '#FFC94A', chatBarBorderTop: 'rgba(255,215,0,0.35)',
    promptGlyph: '#FFC94A',
    defaultExtras: { notifSound: 'synth', bubbleAnim: 'pop', sendEffect: 'flash', headerGlow: true, tabPulse: true, typingStyle: 'wave', chatShimmer: true },
  },

  hologram: {
    id: 'hologram', name: 'HOLOGRAM', isDefault: false, tier: 'elite',
    tagline: 'Iridescent projection interface', category: 'NEON',
    icon: 'cube-scan', badge: 'NEW',
    primary: '#38D9E8', secondary: '#FF5FA8', tertiary: '#FFC94A',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#4A9EFF',
    textAccent: '#38D9E8', textDim: '#4A9EFF', textHi: '#F4F8FF', textMid: '#38D9E8',
    glowColor: '#38D9E8', borderColor: '#38D9E8', borderBrt: '#38D9E8',
    userBubble: '#4A9EFF', aiBubble: '#070A10', aiBorder: 'rgba(0,255,255,0.22)',
    chatBarBg: '#070A10', chatBarTopGlow: '#38D9E8', chatBarBorderTop: 'rgba(0,255,255,0.30)',
    promptGlyph: '#38D9E8',
    defaultExtras: { notifSound: 'synth', bubbleAnim: 'glow', sendEffect: 'flash', headerGlow: true, tabPulse: true, typingStyle: 'scan', chatShimmer: true },
  },

  // ── REVIEW REWARD — Earned by leaving a Play Store review ──
  champion_holo: {
    id: 'champion_holo', name: 'CHAMPION HOLO', isDefault: false, tier: 'free',
    tagline: 'The rarest theme — earned, not bought. Iridescent panels shift between every color.',
    category: 'NEON',
    icon: 'star-shooting', badge: 'RARE',
    primary: '#A468FF', secondary: '#38D9E8', tertiary: '#FFC94A',
    bg: '#050810', panel: '#0B0F17', panelBrt: '#A468FF',
    textAccent: '#A468FF', textDim: '#A468FF', textHi: '#F4F8FF', textMid: '#A468FF',
    glowColor: '#A468FF', borderColor: '#A468FF', borderBrt: '#A468FF',
    userBubble: '#A468FF', aiBubble: '#050810', aiBorder: 'rgba(238,68,255,0.30)',
    chatBarBg: '#050810', chatBarTopGlow: '#A468FF', chatBarBorderTop: 'rgba(238,68,255,0.35)',
    promptGlyph: '#A468FF',
    defaultExtras: { notifSound: 'synth', bubbleAnim: 'glow', sendEffect: 'flash', headerGlow: true, tabPulse: true, typingStyle: 'scan', chatShimmer: true },
  },
};

// ─── TIER CONFIG ────────────────────────────────────────────────
export const TIER_CONFIG = {
  free: {
    name: 'NEXUS CORE',
    price: 'FREE',
    color: '#38D9E8',
    icon: 'hexagon-outline' as const,
    themeIds: ['nexus'],
    features: [
      'Default NEXUS CORE theme',
      'Full app functionality forever',
      'All automation features',
      'Local AI chat with Ollama',
    ],
  },
  supporter: {
    name: 'SUPPORTER',
    price: '$2.99',
    color: '#4A9EFF',
    icon: 'heart-outline' as const,
    themeIds: ['cobalt', 'titanium', 'void'],
    features: [
      '3 exclusive themes: Cobalt Depth, Titanium Grey, Void Protocol',
      'Priority bug fixes',
      'Supporter badge (coming soon)',
      "Dev's eternal gratitude",
    ],
  },
  pro: {
    name: 'PRO PATRON',
    price: '$9.99',
    color: '#FF5FA8',
    icon: 'star-outline' as const,
    isPopular: true,
    themeIds: ['cobalt', 'titanium', 'void', 'solar', 'sakura', 'matrix', 'aurora'],
    features: [
      'All Supporter themes included',
      '4 extra themes: Solar Flare, Sakura Neon, Matrix Green, Aurora Borealis',
      'Name in credits (next release)',
      'Direct feature request channel',
      '10 bonus automation scripts',
    ],
  },
  elite: {
    name: 'ELITE BACKER',
    price: '$24.99',
    color: '#FFC94A',
    icon: 'diamond-outline' as const,
    themeIds: ['cobalt', 'titanium', 'void', 'solar', 'sakura', 'matrix', 'aurora', 'phantom', 'sigma', 'quantum', 'hologram'],
    features: [
      'ALL 11 premium themes included',
      'Vote on next major feature',
      'Listed as Elite Backer in-app',
      '30+ curated script pack',
      'Lifetime supporter status',
      'Early access to beta builds',
    ],
  },
  review: {
    name: 'REVIEW REWARD',
    price: 'FREE',
    color: '#A468FF',
    icon: 'star-shooting' as const,
    isReviewReward: true,
    themeIds: ['champion_holo'],
    features: [
      'Exclusive CHAMPION HOLO theme',
      'Holographic iridescent panels shift color',
      'Rarest Butler AI theme — earned, not bought',
      'Community badge · Play Store reviewer',
    ],
  },
} as const;

export type TierId = keyof typeof TIER_CONFIG;
export type ReviewUnlockStatus = 'locked' | 'verifying' | 'unlocked';
const REVIEW_UNLOCK_KEY = '@butler_review_reward_v1';
export async function checkReviewUnlock(): Promise<boolean> {
  try { const v = await AsyncStorage.getItem(REVIEW_UNLOCK_KEY); return v === 'unlocked'; } catch { return false; }
}
export async function grantReviewReward(): Promise<void> {
  await AsyncStorage.setItem(REVIEW_UNLOCK_KEY, 'unlocked');
}

// ─── CONTEXT TYPE ────────────────────────────────────────────────
interface CosmeticContextType {
  // Active theme
  activePackId: string;
  currentPackId: string;
  activeTheme: AppTheme;
  T: AppTheme;
  // Preview mode — theme used for rendering without committing
  previewPackId: string | null;
  previewTheme: AppTheme | null;
  effectiveTheme: AppTheme; // previewTheme if active, else activeTheme
  isPreviewMode: boolean;
  // Fade animation value — opacity transitions when theme switches.
  // null only in the raw default context (before Provider mounts); always
  // a real Animated.Value when accessed through CosmeticProvider.
  fadeAnim: Animated.Value | null;
  // Actions
  applyPack: (packId: string) => void;
  setActivePack: (packId: string) => Promise<void>;
  startPreview: (packId: string) => void;
  endPreview: () => void;
  confirmPreview: () => void;
  // Unlock
  isUnlocked: (packId: string) => boolean;
  unlockedIds: Set<string>;
  addUnlocked: (packId: string) => Promise<void>;
  reviewRewardUnlocked: boolean;
  setReviewRewardUnlocked: (v: boolean) => void;
  // Legacy
  isPrimeActive: boolean;
  getColor: (key: keyof Pick<AppTheme, 'primary' | 'secondary' | 'tertiary' | 'glowColor' | 'borderColor' | 'textAccent'>) => string;
  extras: PackExtras;
  updateExtras: (updates: Partial<PackExtras>) => Promise<void>;
}

const STORAGE_ACTIVE   = '@butler_packs_active_v5';
const STORAGE_UNLOCKED = '@butler_packs_unlocked_v5';
const STORAGE_EXTRAS   = '@butler_packs_extras_v5';

export const CosmeticContext = createContext<CosmeticContextType>({
  activePackId:  'nexus',
  currentPackId: 'nexus',
  activeTheme:   PACK_THEMES.nexus,
  T:             PACK_THEMES.nexus,
  previewPackId: null,
  previewTheme:  null,
  effectiveTheme: PACK_THEMES.nexus,
  isPreviewMode: false,
  // Safe inert default — never constructed at module scope to avoid
  // react-native-web WeakMap registration crash before Provider mounts.
  fadeAnim:      null,
  applyPack:     () => {},
  setActivePack: async () => {},
  startPreview:  () => {},
  endPreview:    () => {},
  confirmPreview: () => {},
  isUnlocked:    () => true,
  unlockedIds:   new Set(Object.keys(PACK_THEMES)),
  addUnlocked:   async () => {},
  reviewRewardUnlocked: false,
  setReviewRewardUnlocked: () => {},
  isPrimeActive: false,
  getColor:      () => '#38D9E8',
  extras:        DEFAULT_EXTRAS,
  updateExtras:  async () => {},
});

// ─── PROVIDER ────────────────────────────────────────────────────
export function CosmeticProvider({ children }: { children: React.ReactNode }) {
  const [activePackId,  setActivePackId]  = useState('nexus');
  const [previewPackId, setPreviewPackId] = useState<string | null>(null);
  const [unlockedIds,   setUnlockedIds]   = useState<Set<string>>(new Set(Object.keys(PACK_THEMES)));
  const [extras,        setExtras]        = useState<PackExtras>(DEFAULT_EXTRAS);
  const [packExtrasMap, setPackExtrasMap] = useState<Record<string, Partial<PackExtras>>>({});
  const [reviewRewardUnlocked, setReviewRewardUnlockedState] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Load persisted state
  useEffect(() => {
    (async () => {
      try {
        const [activeRaw, unlockedRaw, extrasRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_ACTIVE),
          AsyncStorage.getItem(STORAGE_UNLOCKED),
          AsyncStorage.getItem(STORAGE_EXTRAS),
        ]);
        const resolvedPackId = (activeRaw && PACK_THEMES[activeRaw]) ? activeRaw : 'nexus';
        if (resolvedPackId !== 'nexus') setActivePackId(resolvedPackId);
        // Load review reward status
        const reviewStatus = await AsyncStorage.getItem(REVIEW_UNLOCK_KEY).catch(() => null);
        if (reviewStatus === 'unlocked') {
          setReviewRewardUnlockedState(true);
          setUnlockedIds(prev => new Set([...prev, 'champion_holo']));
        }

        if (unlockedRaw) {
          try {
            const saved = JSON.parse(unlockedRaw) as string[];
            setUnlockedIds(new Set([...saved, ...Object.keys(PACK_THEMES)]));
          } catch {}
        }
        let map: Record<string, Partial<PackExtras>> = {};
        if (extrasRaw) { try { map = JSON.parse(extrasRaw); setPackExtrasMap(map); } catch {} }
        const packDefaults = PACK_THEMES[resolvedPackId]?.defaultExtras ?? {};
        const userOverrides = map[resolvedPackId] ?? {};
        setExtras({ ...DEFAULT_EXTRAS, ...packDefaults, ...userOverrides });
      } catch {}
    })();
  }, []);

  // Fade animation whenever effective theme changes
  const animateTransition = useCallback((callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.3, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1,   duration: 200, useNativeDriver: true }),
    ]).start();
    callback();
  }, [fadeAnim]);

  const setActivePack = useCallback(async (packId: string) => {
    const theme = PACK_THEMES[packId] || PACK_THEMES.nexus;
    animateTransition(() => { setActivePackId(theme.id); setPreviewPackId(null); });
    try { await AsyncStorage.setItem(STORAGE_ACTIVE, theme.id); } catch {}
    const packDefaults = theme.defaultExtras ?? {};
    const userOverrides = packExtrasMap[theme.id] ?? {};
    setExtras({ ...DEFAULT_EXTRAS, ...packDefaults, ...userOverrides });
  }, [packExtrasMap, animateTransition]);

  const applyPack = useCallback((packId: string) => {
    const theme = PACK_THEMES[packId] || PACK_THEMES.nexus;
    animateTransition(() => { setActivePackId(theme.id); setPreviewPackId(null); });
    AsyncStorage.setItem(STORAGE_ACTIVE, theme.id).catch(() => {});
    const packDefaults = theme.defaultExtras ?? {};
    const userOverrides = packExtrasMap[theme.id] ?? {};
    setExtras({ ...DEFAULT_EXTRAS, ...packDefaults, ...userOverrides });
  }, [packExtrasMap, animateTransition]);

  const startPreview = useCallback((packId: string) => {
    animateTransition(() => setPreviewPackId(packId));
  }, [animateTransition]);

  const endPreview = useCallback(() => {
    animateTransition(() => setPreviewPackId(null));
  }, [animateTransition]);

  const confirmPreview = useCallback(() => {
    if (previewPackId) applyPack(previewPackId);
  }, [previewPackId, applyPack]);

  const addUnlocked = useCallback(async (packId: string) => {
    setUnlockedIds(prev => {
      const next = new Set([...prev, packId, ...Object.keys(PACK_THEMES)]);
      AsyncStorage.setItem(STORAGE_UNLOCKED, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const isUnlocked = useCallback((packId: string) => {
    if (packId === 'champion_holo') return reviewRewardUnlocked;
    return true; // all paid packs free during early access
  }, [reviewRewardUnlocked]);

  const setReviewRewardUnlocked = useCallback((v: boolean) => {
    setReviewRewardUnlockedState(v);
    if (v) {
      setUnlockedIds(prev => new Set([...prev, 'champion_holo']));
      AsyncStorage.setItem(REVIEW_UNLOCK_KEY, 'unlocked').catch(() => {});
    }
  }, []);

  const getColor = useCallback((key: keyof Pick<AppTheme, 'primary' | 'secondary' | 'tertiary' | 'glowColor' | 'borderColor' | 'textAccent'>) => {
    return (PACK_THEMES[activePackId] || PACK_THEMES.nexus)[key] as string;
  }, [activePackId]);

  const updateExtras = useCallback(async (updates: Partial<PackExtras>) => {
    const newExtras = { ...extras, ...updates };
    setExtras(newExtras);
    const newMap = { ...packExtrasMap, [activePackId]: { ...(packExtrasMap[activePackId] ?? {}), ...updates } };
    setPackExtrasMap(newMap);
    try { await AsyncStorage.setItem(STORAGE_EXTRAS, JSON.stringify(newMap)); } catch {}
  }, [extras, packExtrasMap, activePackId]);

  const activeTheme   = useMemo(() => PACK_THEMES[activePackId]   || PACK_THEMES.nexus, [activePackId]);
  const previewTheme  = useMemo(() => previewPackId ? (PACK_THEMES[previewPackId] || null) : null, [previewPackId]);
  const effectiveTheme = previewTheme || activeTheme;
  const isPrimeActive = activePackId !== 'nexus';

  const contextValue = useMemo(() => ({
    activePackId, currentPackId: activePackId,
    activeTheme, T: effectiveTheme,
    previewPackId, previewTheme, effectiveTheme,
    isPreviewMode: !!previewPackId,
    fadeAnim,
    applyPack, setActivePack,
    startPreview, endPreview, confirmPreview,
    unlockedIds, isUnlocked, addUnlocked,
    reviewRewardUnlocked, setReviewRewardUnlocked,
    isPrimeActive,
    getColor, extras, updateExtras,
  }), [
    activePackId, activeTheme, effectiveTheme,
    previewPackId, previewTheme,
    fadeAnim,
    applyPack, setActivePack, startPreview, endPreview, confirmPreview,
    unlockedIds, isUnlocked, addUnlocked,
    reviewRewardUnlocked, setReviewRewardUnlocked,
    isPrimeActive, getColor, extras, updateExtras,
  ]);

  return (
    <CosmeticContext.Provider value={contextValue}>
      {children}
    </CosmeticContext.Provider>
  );
}

export function useCosmetic() { return useContext(CosmeticContext); }
export function useTheme(): AppTheme { return useContext(CosmeticContext).effectiveTheme; }
