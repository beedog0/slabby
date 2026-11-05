// Design tokens from DESIGN.md. Components never hardcode colors or sizes.
import type { TextStyle } from 'react-native';

export const color = {
  canvas: '#FFFFFF',
  well: '#F2F2F4',
  ink: '#0A0A0A',
  secondary: '#6E6E73',
  hairline: '#E5E5EA',
  gain: '#1D9A5B',
  loss: '#D9372B',
  conText: '#B8650A',
  conFill: '#FFB020',
  psaRed: '#D01C2A',
  onInk: '#FFFFFF',
  // Slab-only surfaces (the slab is the one object with depth).
  slabCase: '#FFFFFF',
  slabLabel: '#FAFAFA',
  // Display shelf: flat two-tone wood, no gradient. Furniture, so it may carry depth like the slab.
  shelfTop: '#B48A5E',
  shelfFront: '#8C6239',
  /** Empty-state slab outline. */
  ghost: '#D8D8DE',
} as const;

export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 32,
  xxxl: 48,
  gutter: 20,
  section: 32,
} as const;

export const radius = {
  row: 0,
  button: 14,
  field: 14,
  sheet: 28,
  segmented: 9,
  thumb: 3,
  slab: 12,
} as const;

export const size = {
  button: 52,
  touch: 44,
  rowVault: 64,
  rowCon: 74,
  thumbW: 36,
  thumbH: 50,
  heroW: 190,
  heroH: 305, // 190 × PSA's 134.6/83.9
  sparkW: 56,
  sparkH: 24,
  stepper: 32,
  hairline: 1,
  shelfTop: 6,
  shelfFront: 10,
  carouselSlabW: 220,
  viewIcon: 40,
} as const;

const tab: TextStyle = { fontVariant: ['tabular-nums'] };
// Letter spacing in DESIGN.md is in em; RN wants points.
const em = (fontSize: number, e: number) => Math.round(fontSize * e * 100) / 100;

export const type = {
  displayXL: { ...tab, fontSize: 72, fontWeight: '600', letterSpacing: em(72, -0.04) },
  displayL: { ...tab, fontSize: 64, fontWeight: '600', letterSpacing: em(64, -0.04) },
  displayM: { ...tab, fontSize: 48, fontWeight: '600', letterSpacing: em(48, -0.035) },
  displayS: { ...tab, fontSize: 34, fontWeight: '600', letterSpacing: em(34, -0.03) },
  title: { ...tab, fontSize: 28, fontWeight: '600', letterSpacing: em(28, -0.02) },
  section: { ...tab, fontSize: 20, fontWeight: '600', letterSpacing: em(20, -0.02) },
  rowPrice: { ...tab, fontSize: 22, fontWeight: '600', letterSpacing: em(22, -0.02) },
  numberM: { ...tab, fontSize: 17, fontWeight: '600' },
  body: { ...tab, fontSize: 17, fontWeight: '500' },
  button: { ...tab, fontSize: 17, fontWeight: '600' },
  text: { ...tab, fontSize: 15, fontWeight: '400' },
  secondary: { ...tab, fontSize: 13, fontWeight: '400' },
  caption: { ...tab, fontSize: 12, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  thumb: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  slabContact: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  shelf: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  slabAmbient: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 28 },
  },
} as const;

export const slabPose = {
  rotateY: '-7deg',
  rotateX: '3deg',
  perspective: 900,
} as const;

/** Sparkline color thresholds: ±3% over 30 days. */
export const trendThreshold = 0.03;

