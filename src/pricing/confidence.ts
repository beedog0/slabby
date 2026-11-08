// How much to trust a market price, in one plain line under it: how many sales it rests on.
// Graded prices come from eBay sold comps, so the count is the signal. Raw prices are TCGplayer's
// market, which has no sale count here, so the line names the source instead. Pure; tested.

import { shortDay } from '../lib/format';

export type ConfidenceLevel = 'solid' | 'thin' | 'none';

export type Confidence = { level: ConfidenceLevel; line: string };

type PriceLike = { sales30d: number; sales90d?: number; lastSaleDay?: string | null } | null | undefined;

/** Eight or more sales in 30 days reads as a solid price. */
export const SOLID_SALES_30D = 8;
/** Under three sales in 30 days is thin: one odd sale can move the price a lot. */
export const THIN_SALES_30D = 3;

const sales = (n: number) => `${n} ${n === 1 ? 'sale' : 'sales'}`;

export function priceConfidence(p: PriceLike, opts: { raw?: boolean } = {}): Confidence {
  if (opts.raw) return p ? { level: 'solid', line: 'TCGplayer market price' } : { level: 'none', line: 'No TCGplayer price yet' };
  if (!p) return { level: 'none', line: 'No sales found yet' };
  const s30 = p.sales30d;
  // Without sales90d (prices saved before it existed) the 30-day count is a lower bound.
  const s90 = Math.max(p.sales90d ?? s30, s30);
  if (s30 >= THIN_SALES_30D) return { level: s30 >= SOLID_SALES_30D ? 'solid' : 'thin', line: `From ${sales(s30)} in 30 days` };
  if (s30 > 0) return { level: 'thin', line: `Thin · ${sales(s30)} in 30 days` };
  if (s90 > 0) return { level: 'thin', line: `Thin · no sales in 30 days, ${s90} in 90` };
  return { level: 'none', line: p.lastSaleDay ? `No sales in 90 days · last sold ${shortDay(p.lastSaleDay)}` : 'No sales in 90 days' };
}
