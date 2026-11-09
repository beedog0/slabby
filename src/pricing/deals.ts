// Cards sold together in one deal. A deal isn't stored separately: every way of selling several
// cards at once (Select → Sold together, con mode's Sold together and bundle) marks them sold with
// the same timestamp and place, so cards that share both are one deal. That covers sales made
// before deals existed too, and needs nothing new in the database. A deal's total is the sum of
// its cards' sale prices, so editing one card's share keeps the deal honest.

import type { Card } from '../types';

export type Deal = {
  key: string;
  /** In the order they're in the vault. */
  ids: string[];
  /** Sum of the cards' sale prices; null when the deal was saved without a price. */
  totalCents: number | null;
  soldAt: string;
  soldWhere: string | null;
};

export function dealKey(c: Pick<Card, 'status' | 'soldAt' | 'soldWhere'>): string | null {
  if (c.status !== 'sold' || !c.soldAt) return null;
  const t = Date.parse(c.soldAt);
  if (Number.isNaN(t)) return null;
  return `${t}|${c.soldWhere ?? ''}`;
}

/** Every deal of two or more cards, by card id. Cards sold on their own aren't in the map. */
export function dealsByCard(cards: Card[]): Map<string, Deal> {
  const groups = new Map<string, Card[]>();
  for (const c of cards) {
    const k = dealKey(c);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const out = new Map<string, Deal>();
  for (const [key, g] of groups) {
    if (g.length < 2) continue;
    const priced = g.filter((c) => c.soldCents != null);
    const deal: Deal = {
      key,
      ids: g.map((c) => c.id),
      totalCents: priced.length ? priced.reduce((a, c) => a + c.soldCents!, 0) : null,
      soldAt: g[0].soldAt!,
      soldWhere: g[0].soldWhere,
    };
    for (const c of g) out.set(c.id, deal);
  }
  return out;
}

// One grouping per vault snapshot, however many captions ask for it.
const cache = new WeakMap<Card[], Map<string, Deal>>();
export function dealsFor(cards: Card[]): Map<string, Deal> {
  let m = cache.get(cards);
  if (!m) {
    m = dealsByCard(cards);
    cache.set(cards, m);
  }
  return m;
}
