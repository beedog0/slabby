// The graded headline price: the median of the last 5 sales, however far back they go within the
// history we keep (180 days). A rolling 30-day median taken over one or two sales swings with
// whichever slab happened to sell, so a card with fewer than 5 sales (or only old ones) gets no
// median: its headline is the last sale, shown as such, and nothing auto-fills a buy target.
//
// PPT on our plan gives one average per day with a count, so sales are count-weighted days: a
// day with 3 sales at $310 counts as three $310 sales and lists as one line, "avg of 3". When PPT
// Business adds individual sales, pass them as days with count 1 and the same rules apply.

import type { CardPrice } from '../services/comps';

export type SaleDay = { day: string; cents: number; count: number };

/** Sales behind a median headline. */
export const LAST_N = 5;
/** History we look back over for those sales. */
export const LOOKBACK_DAYS = 180;
/** A newest sale older than this is too old to call a price; the headline says when it was. */
export const STALE_DAYS = 90;

export type Headline =
  | { basis: 'median5'; cents: number; lines: SaleDay[]; sales: number }
  | { basis: 'lastSold'; cents: number; lines: SaleDay[]; sales: number; reason: 'few' | 'old' };

export type Basis = Headline['basis'];

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** Days with a sale in the lookback, newest first, merged by calendar day (count-weighted). */
export function saleDaysNewestFirst(days: SaleDay[], today: string, lookback = LOOKBACK_DAYS): SaleDay[] {
  const by = new Map<string, { sum: number; count: number }>();
  for (const d of days) {
    if (!(d.count > 0) || !(d.cents > 0)) continue;
    const day = d.day.slice(0, 10);
    const age = daysBetween(day, today);
    if (age < 0 || age >= lookback) continue;
    const m = by.get(day) ?? { sum: 0, count: 0 };
    m.sum += d.cents * d.count;
    m.count += d.count;
    by.set(day, m);
  }
  return [...by.entries()]
    .map(([day, m]) => ({ day, cents: Math.round(m.sum / m.count), count: m.count }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Median of a sorted list. */
function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The headline for one graded price from its sale days. Null when there's no sale at all in the
 * lookback (the caller keeps whatever it had and says so).
 */
export function headline(days: SaleDay[], today: string, n = LAST_N): Headline | null {
  const all = saleDaysNewestFirst(days, today);
  if (!all.length) return null;
  const total = all.reduce((s, d) => s + d.count, 0);
  const lines: SaleDay[] = [];
  const values: number[] = [];
  for (const d of all) {
    if (values.length >= n) break;
    lines.push(d);
    for (let i = 0; i < d.count && values.length < n; i++) values.push(d.cents);
  }
  const old = daysBetween(all[0].day, today) > STALE_DAYS;
  if (values.length < n || old) {
    return { basis: 'lastSold', cents: all[0].cents, lines: all.slice(0, n), sales: total, reason: old && values.length >= n ? 'old' : 'few' };
  }
  return { basis: 'median5', cents: median([...values].sort((a, b) => a - b)), lines, sales: total };
}

/** A CardPrice carries its headline fields (basis, recent, median30Cents) itself. */
export type Headlined = CardPrice;

/**
 * A graded CardPrice with its headline applied: marketCents becomes the median of the last 5
 * sales (or the last sale), so vault value, ask/floor, con mode and search all read one number.
 * Without sale days it's returned unchanged.
 */
export function withHeadline<P extends CardPrice>(p: P, days: SaleDay[] | null | undefined, today: string): P {
  if (!days?.length) return p;
  const h = headline(days, today);
  if (!h) return p;
  return { ...p, marketCents: h.cents, basis: h.basis, recent: h.lines, median30Cents: p.marketCents };
}

/** False when the headline is a last sale: no buy target or max is filled in from it. */
export function canAutoPrice(p: { basis?: Basis } | null | undefined): boolean {
  return p?.basis !== 'lastSold';
}
