// Key stats for a card opened from search: plain numbers a collector can check, one grade at a
// time, plus a one-line read built from them. No composite score: a "7.4/10" hides which number
// drove it and looks just as sure on two sales as on two hundred. Every rule here hides a stat
// rather than show one built on too little data.

import type { CardPrice } from '../services/comps';
import { ebayNet } from './rules';

/** Enough history for 90-day high, low and change: real points and how far back they reach. */
export const MIN_POINTS = 10;
export const MIN_SPAN_DAYS = 30;
/** Enough sales for a range, a grade-to-grade ratio, or grading math. */
export const MIN_SALES = 5;
/** Grading cost assumed on the raw page: PSA value tier plus shipping and insurance both ways. */
export const GRADING_FEE_CENTS = 2500;
export const GRADING_SHIP_CENTS = 800;

export type Liquidity = 'Liquid' | 'Slow' | 'Stale';
export type Trend = 'Rising' | 'Flat' | 'Falling';

type Priced = CardPrice & { points?: number; since?: string };

/** Real data points behind a series. Old cached answers lack `points`: a flat line counts as one. */
export function realPoints(p: Priced | null | undefined): number {
  if (!p) return 0;
  if (p.points != null) return p.points;
  const s = p.series90;
  return s.length > 1 && s.every((v) => v === s[0]) ? 1 : s.length;
}

/** Draw a chart only when there are at least 3 real prices; a carried-forward line isn't history. */
export function chartable(p: Priced | null | undefined): boolean {
  return !!p && p.series90.length > 1 && realPoints(p) >= 3;
}

/** 90-day high, low and change, or null when the history is too thin to say. */
export function history(p: Priced | null | undefined): { high: number; low: number; change: number; days: number } | null {
  if (!p || realPoints(p) < MIN_POINTS || p.series90.length < MIN_SPAN_DAYS + 1) return null;
  const s = p.series90;
  return { high: Math.max(...s), low: Math.min(...s), change: s[s.length - 1] / s[0] - 1, days: Math.min(90, s.length) };
}

export function liquidity(sales30d: number): Liquidity {
  return sales30d >= 10 ? 'Liquid' : sales30d >= 3 ? 'Slow' : 'Stale';
}

export function trend(change: number): Trend {
  return change > 0.03 ? 'Rising' : change < -0.03 ? 'Falling' : 'Flat';
}

/** (p90 − p10) ÷ median of 30 days of sales, or null under MIN_SALES. */
export function spread(p: CardPrice | null | undefined): number | null {
  if (!p || p.sales30d < MIN_SALES || p.marketCents <= 0) return null;
  return (p.highCents - p.lowCents) / p.marketCents;
}

export function spreadWord(s: number): 'Tight range' | 'Wide range' | null {
  return s < 0.15 ? 'Tight range' : s > 0.35 ? 'Wide range' : null;
}

/** a ÷ b when both prices exist (and graded ones have enough sales). */
export function ratio(a: CardPrice | null | undefined, b: CardPrice | null | undefined, aGraded = true, bGraded = true): number | null {
  if (!a || !b || a.marketCents <= 0 || b.marketCents <= 0) return null;
  if ((aGraded && a.sales30d < MIN_SALES) || (bGraded && b.sales30d < MIN_SALES)) return null;
  return a.marketCents / b.marketCents;
}

export type GradingRead =
  | { kind: 'pays-at-9' }
  | { kind: 'never' }
  | { kind: 'odds'; oneIn: number; share: number };

/**
 * Should you buy it raw and grade it? Cost = raw + grading + shipping. Sell nets come from eBay
 * fees. Without a gem rate we can't say what you'd get, so this says what you'd need: the share
 * of PSA 10s that breaks even, counting every miss as a PSA 9 (generous; real misses go lower).
 */
export function gradingRead(raw: CardPrice | null | undefined, psa10: CardPrice | null | undefined, psa9: CardPrice | null | undefined): GradingRead | null {
  if (!raw || !psa10 || !psa9 || psa10.sales30d < MIN_SALES || psa9.sales30d < MIN_SALES) return null;
  const cost = raw.marketCents + GRADING_FEE_CENTS + GRADING_SHIP_CENTS;
  const net9 = ebayNet(psa9.marketCents);
  const net10 = ebayNet(psa10.marketCents);
  if (net9 >= cost) return { kind: 'pays-at-9' };
  if (net10 <= cost) return { kind: 'never' };
  const share = (cost - net9) / (net10 - net9);
  return { kind: 'odds', share, oneIn: Math.max(1, Math.round(1 / share)) };
}

export function gradingLine(r: GradingRead): string {
  if (r.kind === 'pays-at-9') return 'Grading pays even if it comes back a PSA 9.';
  if (r.kind === 'never') return 'Even a PSA 10 doesn’t cover the raw price plus grading.';
  if (r.share > 0.8) return 'Grading only pays if it comes back a PSA 10.';
  return `Grading pays if about 1 in ${r.oneIn} come back PSA 10.`;
}

/** Chart windows on the search card page. ALL = everything we have (raw goes back to Feb 2024). */
export const ALL = 10_000 as const;
export const RANGES = [30, 90, 180, 365, ALL] as const;
export type Range = (typeof RANGES)[number];
export const rangeLabel = (r: Range) => (r === ALL ? 'All' : r === 365 ? '1Y' : r === 180 ? '6M' : `${r}D`);

/** Days of history a card needs before 1Y / All are offered, so they never just repeat 6M. */
const LONG_MIN_DAYS: Record<number, number> = { 365: 330, [ALL]: 240 };

const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The chart for one window ending `today`: daily values and the day of the last one, or null when
 * the window holds fewer than 3 real prices (a value that differs from the day before counts as
 * one; the first day counts too). Uses the 180-day history when the answer has it; older answers
 * only have series90, which serves the 30 and 90 day windows.
 */
export function rangeSeries(p: CardPrice | null | undefined, range: Range, today: string): { values: number[]; asOf: string } | null {
  if (!p) return null;
  let values: number[];
  let asOf: string;
  if (p.hist?.length && p.histFrom) {
    asOf = shiftDay(p.histFrom, p.hist.length - 1);
    if (LONG_MIN_DAYS[range] && p.hist.length < LONG_MIN_DAYS[range]) return null;
    const start = range === ALL ? p.histFrom : shiftDay(today, -(range - 1));
    const skip = Math.max(0, Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${p.histFrom}T00:00:00Z`)) / 86_400_000));
    values = p.hist.slice(skip);
  } else {
    if (range >= 180 || !chartable(p)) return null;
    values = p.series90.slice(-range);
    asOf = p.asOf;
  }
  if (values.length < 2) return null;
  let real = 1;
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1]) real++;
  return real >= 3 ? { values, asOf } : null;
}

/** Windows worth offering: those with a chart. */
export function chartRanges(p: CardPrice | null | undefined, today: string): Range[] {
  return RANGES.filter((r) => rangeSeries(p, r, today) != null);
}
