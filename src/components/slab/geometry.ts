// PSA slab geometry in millimetres (SLAB_ASSET_BRIEF.md), scaled to points by the slab's width.
// Everything the case draws comes from these numbers, so the front, back and edges line up.

import type { Grader } from '../../types';

export const MM = {
  width: 83.9,
  height: 134.6,
  corner: 2.2,
  /** Case depth; BGS cases are 2 mm thicker. */
  thickness: 8,
  bgsExtra: 2,
  frameInset: 3.5,
  labelHeight: 18.5,
  labelGap: 2,
  card: { width: 63, height: 88, corner: 3 },
  /** The clear insert that holds the card, outside the card edge. */
  insertMargin: 1.4,
} as const;

export const SLAB_ASPECT = MM.height / MM.width; // 1.604

export type SlabLayout = {
  k: number; // points per mm
  w: number;
  h: number;
  depth: number;
  corner: number;
  frame: number;
  label: { x: number; y: number; w: number; h: number };
  well: { x: number; y: number; w: number; h: number };
  card: { x: number; y: number; w: number; h: number; r: number };
};

export function slabLayout(width: number, grader: Grader = 'psa'): SlabLayout {
  const k = width / MM.width;
  const h = width * SLAB_ASPECT;
  const frame = MM.frameInset * k;
  const label = { x: frame, y: frame, w: width - frame * 2, h: MM.labelHeight * k };
  const wellY = label.y + label.h + MM.labelGap * k;
  const well = { x: frame, y: wellY, w: width - frame * 2, h: h - frame - wellY };
  const cw = MM.card.width * k;
  const ch = MM.card.height * k;
  const card = {
    w: cw,
    h: ch,
    x: (width - cw) / 2,
    // Real slabs seat the card a touch high in the well.
    y: well.y + (well.h - ch) * 0.42,
    r: MM.card.corner * k,
  };
  const depth = (MM.thickness + (grader === 'bgs' ? MM.bgsExtra : 0)) * k;
  return { k, w: width, h, depth, corner: MM.corner * k, frame, label, well, card };
}

/**
 * Label colours per grader, so a slab reads as PSA, BGS or CGC by colour alone (no logos).
 * PSA: white paper, red frame, red 10. BGS: black label with a gold edge at 9.5 and up,
 * silver below. CGC: blue-to-white label, blue frame and numeral.
 */
export type LabelInk = {
  paper: string;
  /** Second paper colour for a gradient label (CGC), top-left to bottom-right. */
  paper2: string | null;
  ink: string;
  grade: string;
  sub: string;
  frame: string;
};

export function labelInk(grader: Grader, grade: number | null): LabelInk {
  if (grader === 'bgs') {
    const gold = grade != null && grade >= 9.5;
    return { paper: '#141416', paper2: null, ink: '#F5F5F7', grade: gold ? '#D9B45A' : '#C9CDD3', sub: 'rgba(245,245,247,0.6)', frame: gold ? '#C9A24A' : '#A9AEB6' };
  }
  if (grader === 'cgc') return { paper: '#DCE8F8', paper2: '#FBFDFF', ink: '#0B2A55', grade: '#1A56B8', sub: 'rgba(11,42,85,0.55)', frame: '#1A56B8' };
  return { paper: '#FCFCFA', paper2: null, ink: '#0A0A0A', grade: grade === 10 ? '#D01C2A' : '#0A0A0A', sub: 'rgba(10,10,10,0.55)', frame: '#D01C2A' };
}

/** The grade words each grader prints above the number. */
export function gradeDescriptor(grader: Grader, grade: number | null): string | undefined {
  if (grade == null) return undefined;
  const table: Record<string, Record<string, string>> = {
    psa: { '10': 'GEM MT', '9': 'MINT', '8': 'NM-MT', '7': 'NM', '6': 'EX-MT', '5': 'EX' },
    bgs: { '10': 'PRISTINE', '9.5': 'GEM MINT', '9': 'MINT', '8.5': 'NM-MT+', '8': 'NM-MT', '7': 'NM' },
    cgc: { '10': 'GEM MINT', '9.5': 'MINT+', '9': 'MINT', '8.5': 'NM/MINT+', '8': 'NM/MINT', '7': 'NEAR MINT' },
  };
  const t = table[grader];
  return t?.[String(grade)] ?? t?.[String(Math.floor(grade))];
}
