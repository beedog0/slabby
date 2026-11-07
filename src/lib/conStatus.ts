// Where a slab stands at a con: kept back (hold), on the table (for sale), trade only, or sold.
// "Trade only" is the existing plan 'trade'; this names the four states con mode offers.

import type { Card } from '../types';

export type ConStatus = 'hold' | 'sale' | 'trade' | 'sold';

/** Menu order, and the order the table sheet lists slabs in (holds first). */
export const CON_STATUSES: ConStatus[] = ['hold', 'sale', 'trade', 'sold'];
export const CON_STATUS_ORDER: Record<ConStatus, number> = { hold: 0, sale: 1, trade: 2, sold: 3 };

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

/** The vault patch for Hold, For sale or Trade only. Sold goes through a price. */
export function planPatch(next: 'hold' | 'sale' | 'trade'): Pick<Card, 'plan'> {
  return { plan: next === 'sale' ? 'sell' : next };
}

/** Which con tab a status lives on. Holds aren't on the con screen; they open For sale. */
export function conTabFor(s: ConStatus): 'sale' | 'sold' | 'trade' {
  return s === 'sold' ? 'sold' : s === 'trade' ? 'trade' : 'sale';
}
