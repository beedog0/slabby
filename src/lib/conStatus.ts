// Where a slab stands at a con: kept back (hold), on the table (for sale), trade only, or sold.
// "Trade only" is the existing plan 'trade'; this just names the four states the con screen uses.

import type { Card } from '../types';

export type ConStatus = 'hold' | 'sale' | 'trade' | 'sold';

export const CON_STATUS_LABEL: Record<ConStatus, string> = {
  hold: 'Hold',
  sale: 'For sale',
  trade: 'Trade only',
  sold: 'Sold',
};

export function conStatusOf(card: Pick<Card, 'status' | 'plan'>): ConStatus {
  if (card.status === 'sold') return 'sold';
  if (card.plan === 'sell') return 'sale';
  if (card.plan === 'trade') return 'trade';
  return 'hold';
}

/** The vault patch for moving an owned slab to For sale or Trade only. Sold goes through a price. */
export function planPatch(next: 'sale' | 'trade'): Pick<Card, 'plan'> {
  return { plan: next === 'sale' ? 'sell' : 'trade' };
}

/** Which con tab a status lives on. Holds aren't on the con screen; they open For sale. */
export function conTabFor(s: ConStatus): 'sale' | 'sold' | 'trade' {
  return s === 'sold' ? 'sold' : s === 'trade' ? 'trade' : 'sale';
}
