// eBay sold-listings search for a graded card, so the user can check the comps themselves.

import type { Card } from '../types';

/** "Mew ex 151 205 PSA 10". */
export function ebaySoldQuery(card: Pick<Card, 'name' | 'setName' | 'number' | 'grader' | 'grade'>): string {
  const grade = card.grader === 'raw' ? null : `${card.grader.toUpperCase()} ${card.grade ?? ''}`.trim();
  return [card.name, card.setName, card.number, grade]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** eBay sold and completed listings for the card. */
export function ebaySoldUrl(card: Pick<Card, 'name' | 'setName' | 'number' | 'grader' | 'grade'>): string {
  const q = encodeURIComponent(ebaySoldQuery(card)).replace(/%20/g, '+');
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}
