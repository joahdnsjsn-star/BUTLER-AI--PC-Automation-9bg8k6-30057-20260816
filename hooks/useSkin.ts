/**
 * useSkin — single source of truth that binds EVERY page header (and any
 * component that wants it) to the active cosmetic pack chosen on the SKINS
 * page. Changing a pack re-renders these values instantly: no reload, no
 * restart, no per-page wiring.
 *
 * Also exposes a rotating animation "variant" so the app does not look
 * identical every session — the FX register advances each cold start.
 */
import { useMemo } from 'react';
import { useCosmetic } from '@/contexts/CosmeticContext';
import { getFxVariant } from '@/constants/fxRotation';

export interface Skin {
  /** primary accent — icons, titles, active strokes */
  accent: string;
  /** secondary accent — pills, sub-labels */
  accent2: string;
  /** tertiary accent — highlights, sparks */
  accent3: string;
  ok: string;
  warn: string;
  danger: string;
  bg: string;
  headerBg: string;
  panel: string;
  panel2: string;
  text: string;
  dim: string;
  mid: string;
  border: string;
  glow: string;
  /** 5-stop stripe derived from the pack, used by header accent bars */
  stripe: string[];
  /** rotating FX variant 0..3 — keeps the app feeling fresh */
  variant: number;
  /** pack id, handy for keys so headers re-mount their animations on change */
  packId: string;
  /** true when the pack enables header glow */
  headerGlow: boolean;
  /** alpha helper: a(color, '55') */
  a: (c: string, alpha: string) => string;
}

const alpha = (c: string, al: string) => (c?.startsWith('#') && c.length === 7 ? c + al : c);

export function useSkin(): Skin {
  const { effectiveTheme: T, extras, activePackId } = useCosmetic();

  return useMemo(() => {
    const p = T?.primary   ?? '#38D9E8';
    const s = T?.secondary ?? '#4A9EFF';
    const t = T?.tertiary  ?? '#FFB43D';
    return {
      accent: p,
      accent2: s,
      accent3: t,
      ok: '#2FE38A',
      warn: t,
      danger: '#FF4D5E',
      bg: T?.bg ?? '#050810',
      headerBg: T?.panel ?? '#0B0F17',
      panel: T?.panel ?? '#0B0F17',
      panel2: T?.panelBrt ?? '#111621',
      text: T?.textHi ?? '#DCE6F2',
      dim: T?.textDim ?? '#6B7A92',
      mid: T?.textMid ?? '#9DAABE',
      border: alpha(T?.borderColor ?? p, '2E'),
      glow: T?.glowColor ?? p,
      stripe: [p, s, t, '#2FE38A', T?.glowColor ?? p],
      variant: getFxVariant(),
      packId: activePackId ?? 'nexus',
      headerGlow: extras?.headerGlow !== false,
      a: alpha,
    };
  }, [T, extras?.headerGlow, activePackId]);
}

export default useSkin;
