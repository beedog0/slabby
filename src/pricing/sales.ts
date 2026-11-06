// Recent-sales math for the sales screen. Pure; screens never compute prices.
// Percentiles match price_daily (supabase/functions/_shared/comps-math.ts): linear
// interpolation, low/high = 10th/90th.

import type { SalesResult } from '../types';

export type SalesSummary = { count: number; medianCents: number; lowCents: number; highCents: number };

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const clean = (values: number[]) => values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);

/** Count, median and 10th/90th percentile of prices in cents. Null with no prices. */
export function summarize(values: number[]): SalesSummary | null {
  const v = clean(values);
  if (!v.length) return null;
  return {
    count: v.length,
    medianCents: Math.round(percentile(v, 0.5)),
    lowCents: Math.round(percentile(v, 0.1)),
    highCents: Math.round(percentile(v, 0.9)),
  };
}

/**
 * 'above' / 'below' when a price is outside the fence around the middle half of the values: the
 * larger of 1.5×IQR and 10% of the median, so near-equal prices don't flag tiny differences.
 * Needs at least 5 values.
 */
export function outlier(price: number, values: number[]): 'above' | 'below' | null {
  const v = clean(values);
  if (v.length < 5 || !Number.isFinite(price)) return null;
  const q1 = percentile(v, 0.25);
  const q3 = percentile(v, 0.75);
  const fence = Math.max(1.5 * (q3 - q1), 0.1 * percentile(v, 0.5));
  if (price > q3 + fence) return 'above';
  if (price < q1 - fence) return 'below';
  return null;
}

/** A day's sale count as a whole number ≥ 0 (NaN, fractions and junk can't throw or skew). */
const daySales = (n: unknown) => Math.max(0, Math.floor(Number(n)) || 0);

/** Sales per day that count, like price_daily (comps-math.ts gradedDaily). */
export const DAY_CAP = 50;

/**
 * Prices behind the summary: each sale, or each day's average once per sale that day (weighted
 * like price_daily, capped at DAY_CAP a day). summarize(...).count is the header's sale count.
 */
export function salesValues(r: SalesResult): number[] {
  if (r.kind === 'sales') return r.rows.map((s) => s.priceCents);
  if (r.kind === 'daily') return r.rows.flatMap((d) => new Array<number>(Math.min(daySales(d.sales), DAY_CAP)).fill(d.avgCents));
  return [];
}

/** One point per sale or per day: what the dot strip draws. */
export function salesPoints(r: SalesResult): number[] {
  if (r.kind === 'sales') return r.rows.map((s) => s.priceCents);
  if (r.kind === 'daily') return r.rows.filter((d) => daySales(d.sales) > 0).map((d) => d.avgCents);
  return [];
}

/** Sales counted in a result, with the same per-day cap as salesValues. */
export function salesCount(r: SalesResult): number {
  if (r.kind === 'sales') return r.rows.length;
  if (r.kind === 'daily') return r.rows.reduce((n, d) => n + Math.min(daySales(d.sales), DAY_CAP), 0);
  return 0;
}

export type StripScale = { lo: number; hi: number; flags: ('above' | 'below' | null)[] };

/**
 * The dot strip's price scale: the range of the points that aren't outliers (judged against
 * `values`), padded by `pad` of that range (or of the price when they're all equal). Outliers
 * are flagged so the strip pins them at its edges instead of squashing everything else.
 */
export function stripScale(points: number[], values: number[], pad = 0.04): StripScale {
  const flags = points.map((p) => outlier(p, values));
  const inside = points.filter((p, i) => !flags[i] && Number.isFinite(p));
  const base = inside.length ? inside : points.filter(Number.isFinite);
  if (!base.length) return { lo: 0, hi: 1, flags };
  const lo = Math.min(...base);
  const hi = Math.max(...base);
  const p = hi > lo ? (hi - lo) * pad : Math.max(1, lo * pad);
  return { lo: lo - p, hi: hi + p, flags };
}
