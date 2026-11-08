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

/** What a catalog card page knows: the card and the grade picked on its toggle. */
export type EbayCard = { name: string; setName: string | null; number: string | null; language?: string | null; grade: 'raw' | `psa${number}` };

/**
 * "Charizard ex Obsidian Flames 223/197 PSA 10", with "Japanese" for JP cards. Raw searches drop
 * slabs (-PSA -BGS -CGC), which otherwise fill the first page of every raw search.
 */
export function ebayCardQuery(c: EbayCard): string {
  const grade = c.grade === 'raw' ? null : `PSA ${c.grade.slice(3)}`;
  const lang = c.language === 'ja' ? 'Japanese' : c.language === 'ko' ? 'Korean' : c.language && c.language.startsWith('zh') ? 'Chinese' : null;
  // eBay reads ( , ) as OR groups, so tags like "(Alternate Art)" go in as plain words.
  const name = c.name.replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
  return [name, c.setName?.replace(/^[A-Z0-9.-]{2,8}:\s+/, ''), c.number, lang, grade, c.grade === 'raw' ? '-PSA -BGS -CGC' : null]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

const ebayUrl = (q: string, sold: boolean) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q).replace(/%20/g, '+')}${sold ? '&LH_Sold=1&LH_Complete=1' : '&_sop=15'}`;

/** Sold and completed listings, newest first (eBay's default). */
export const ebayCardSoldUrl = (c: EbayCard) => ebayUrl(ebayCardQuery(c), true);
/** Active listings, lowest price + shipping first. */
export const ebayCardListedUrl = (c: EbayCard) => ebayUrl(ebayCardQuery(c), false);
