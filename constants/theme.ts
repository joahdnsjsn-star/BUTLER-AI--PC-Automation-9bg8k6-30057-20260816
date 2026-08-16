// Flat legacy theme — kept for the original 3 screens (index/connect/settings).
// For the full NEXUS/Dark-Matter HUD token system (colors, fonts, spacing),
// see ./designTokens.ts (richer, nested `theme.colors.*` shape used by newer
// visual components such as RobotThemeUI, FuturisticTabBar, ButlerAITitle3D).
export const theme = {
  bg: '#0B0F17',
  surface: '#4A9EFF',
  surfaceAlt: '#4A9EFF',
  border: 'rgba(255,106,31,0.18)',
  text: '#DCE6F2',
  textMuted: '#4A9EFF',
  primary: '#FF7A1F',
  primaryText: '#FFFFFF',
  success: '#2FE38A',
  danger: '#FF4D5E',
  warn: '#FFC94A',
} as const;

export type Theme = typeof theme;
