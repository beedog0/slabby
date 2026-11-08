// The price a card with no price source shows: your own typed price first, else the AI estimate.
// Pure. Both come back as a CardPrice with `source` set, so ask, floor, value and con mode work
// the same, and screens can say "Estimate" or "Your price" instead of eBay or TCGplayer.
// Real comps always win: priceFor() only calls this when there are none.

import type { CardPrice } from '../services/comps';
import type { EstimateEntry } from '../store/estimates';

export function fallbackPrice(ownCents: number | undefined, entry: EstimateEntry | undefined): CardPrice | null {
  if (ownCents != null && ownCents > 0) {
    return {
      marketCents: ownCents,
      lowCents: ownCents,
      highCents: ownCents,
      sales30d: 0,
      asOf: '',
      series90: [],
      source: 'own',
      estimate: entry?.kind === 'found' ? entry.estimate : undefined,
    };
  }
  if (entry?.kind !== 'found') return null;
  const e = entry.estimate;
  return {
    marketCents: e.priceCents,
    // The floor rule reads the low end. With one sale, low = the sale itself.
    lowCents: e.lowCents,
    highCents: e.highCents,
    sales30d: 0,
    asOf: e.foundAt.slice(0, 10),
    series90: [],
    source: 'estimate',
    estimate: e,
  };
}

/** "Estimate · from 3 sales found online", "Estimate · from 1 sale found online". */
export function estimateLine(n: number): string {
  return `Estimate · from ${n} ${n === 1 ? 'sale' : 'sales'} found online`;
}

/** What the price is called on screens that name its source. */
export function sourceWord(p: CardPrice | null | undefined, raw: boolean): string {
  if (p?.source === 'own') return 'your price';
  if (p?.source === 'estimate') return 'estimate';
  return raw ? 'TCGplayer' : 'market';
}
