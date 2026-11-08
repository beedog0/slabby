// Design tokens from DESIGN.md. Components never hardcode colors or sizes.
import type { TextStyle } from 'react-native';

/** Light palette, the default. Dark mirrors every key; see DESIGN.md. Components read the live one with useColors(). */
export const light = {
  canvas: '#FFFFFF',
  /** Bottom sheets, menus, dropdowns: the same white as the page in light. */
  sheet: '#FFFFFF',
  /** A control lifted off a well: the on segment, keypad keys. */
  raised: '#FFFFFF',
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
  /** Dims the page behind a sheet. Flat, no blur, no gradient. */
  scrim: 'rgba(10,10,10,0.28)',
  /** Lighter dim behind a dropdown: the page stays readable, the white panel still separates. */
  scrimLight: 'rgba(10,10,10,0.16)',
  // Camera screen only: dims the picture outside the label window, and backs the hint.
  scanScrim: 'rgba(0,0,0,0.55)',
  scanHint: 'rgba(0,0,0,0.6)',
  /** Hairline marking where the label ends inside the slab frame. */
  scanGuide: 'rgba(255,255,255,0.45)',
  /** The label window's wash when a read locks. */
  scanLocked: 'rgba(255,176,32,0.18)',
};

export type Palette = typeof light;

/**
 * Dark palette. Ink and canvas swap, so primary buttons turn white with black text; sheets sit one
 * step above the page because there is no shadow to lift them. Gain and loss are brightened just
 * enough to read on near-black. Slab colors (case, label, PSA red) never change: they are the
 * grader's identity, not UI.
 */
export const dark: Palette = {
  canvas: '#0A0A0A',
  sheet: '#161617',
  raised: '#333336',
  well: '#1F1F21',
  ink: '#F4F4F5',
  secondary: '#8C8C91',
  hairline: '#2A2A2C',
  gain: '#34C77B',
  loss: '#FF5A4F',
  conText: '#FFB020',
  conFill: '#FFB020',
  psaRed: light.psaRed,
  onInk: '#0A0A0A',
  slabCase: light.slabCase,
  slabLabel: light.slabLabel,
  shelfTop: '#8F6C49',
  shelfFront: '#6A4A2B',
  ghost: '#2E2E31',
  scrim: 'rgba(0,0,0,0.6)',
  scrimLight: 'rgba(0,0,0,0.45)',
  scanScrim: light.scanScrim,
  scanHint: light.scanHint,
  scanGuide: light.scanGuide,
  scanLocked: light.scanLocked,
};

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
  chip: 15,
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
  /** The slab in the scan result sheet. */
  sheetSlabW: 44,
  /** Scan window: fits a whole slab or a loose card, portrait. */
  scanFrameW: 260,
  scanFrameRatio: 0.66,
  sparkW: 56,
  sparkH: 24,
  stepper: 32,
  hairline: 1,
  shelfTop: 6,
  shelfFront: 10,
  carouselSlabW: 220,
  viewIcon: 40,
  /** Home value chart; its slot keeps this height on every filter so the tabs never move. */
  homeChart: 84,
  /** Menu sheet rows: taller than a vault row's text line, shorter than a con row. */
  menuRow: 52,
  /** The slab in a menu sheet's header. */
  menuSlabW: 44,
  /** Arrange shelf's 1–5 slabs-per-shelf control. */
  perShelfW: 180,
  grabberW: 36,
  grabberH: 5,
  /** Home … dropdown width. */
  dropdownW: 224,
  /** Select mode outline around a picked slab: line weight and its gap from the case. */
  selectLine: 2,
  selectGap: 4,
  // Sales screen.
  saleRow: 72,
  dayRow: 56,
  dotStrip: 32,
  dot: 6,
  medianTick: 16,
  floorTick: 10,
  rangeControl: 132,
  skeletonBar: 14,
  /** Applied-filter chips under search's control row. */
  chip: 30,
} as const;

/** Sheet motion in ms. Opening eases out; closing is quicker so the next screen isn't kept waiting. */
export const motion = {
  sheetIn: 240,
  sheetOut: 180,
  dropIn: 160,
  dropOut: 120,
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
  /** Dropdown menus: the one floating surface besides the slab. */
  menu: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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

