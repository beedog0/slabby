// Price comps. Screens read the materialized daily row (price_daily), never raw price_points.
// Phase 1 step 1 serves mocks; the Supabase read replaces `fetchDaily` without changing callers.

import pricesJson from '../mocks/prices.json';
import { cardKey } from '../pricing/cardKey';
import type { Card } from '../types';

export type CardPrice = {
  marketCents: number;
  /** 10th percentile of eBay sold, 30 days. Feeds the floor rule. */
  lowCents: number;
  /** 90th percentile of eBay sold, 30 days. */
  highCents: number;
  sales30d: number;
  asOf: string;
  /** Daily market, oldest first, up to 90 points. */
  series90: number[];
};

const mock = pricesJson as Record<string, CardPrice>;

export function priceFor(card: Card): CardPrice | null {
  return mock[cardKey(card)] ?? null;
}

/** Change over the last `days` days of the series, as a fraction. */
export function changeOver(p: CardPrice, days: number): number {
  const s = p.series90;
  if (s.length < 2) return 0;
  const from = s[Math.max(0, s.length - 1 - days)];
  return from ? (s[s.length - 1] - from) / from : 0;
}

/** Market value of the card `days` ago, from the series. */
export function valueAgo(p: CardPrice, days: number): number {
  const s = p.series90;
  return s[Math.max(0, s.length - 1 - days)] ?? p.marketCents;
}
