// Links a vault card to its catalog product, so the search card page's analytics (key stats,
// 90-day range, prices by grade, more from the set) can show under any card in the app.
// The server's match (card_refs.tcgplayer_id, set by card-match) wins; otherwise the catalog is
// searched by set code, number and language. Postgres only: prices load later through
// openPrices (card-prices, cached a day), the same call a searched card makes.

import catalogJson from '../mocks/catalog.json';
import { cardKey } from '../pricing/cardKey';
import type { Card } from '../types';
import { cardNumber, catalogCard, searchCards, type CatalogCard, type SearchGrade } from './search';
import { supabase } from './supabase';

export type Choice = 'raw' | SearchGrade;

/**
 * The grade a card's analytics open on: raw for raw, PSA N for a PSA N. BGS and CGC have no
 * price data of their own, so they show the PSA grade with the same whole number (9.5 → PSA 9).
 */
export function choiceFor(card: Pick<Card, 'grader' | 'grade'>): Choice {
  if (card.grader === 'raw' || card.grade == null) return 'raw';
  const n = Math.min(10, Math.max(1, Math.floor(card.grade)));
  return `psa${n}` as SearchGrade;
}

/** True when the card is a catalog match for this vault card: same number, set code and language. */
export function sameCard(c: Pick<CatalogCard, 'number' | 'setCode' | 'language'>, card: Pick<Card, 'number' | 'setCode' | 'language'>): boolean {
  const lang = (l: string) => (l === 'ja' ? 'ja' : l || 'en');
  if (!card.number || cardNumber(c.number).toLowerCase() !== cardNumber(card.number).toLowerCase()) return false;
  if (lang(c.language) !== lang(card.language)) return false;
  return !card.setCode || !c.setCode || c.setCode.toLowerCase() === card.setCode.toLowerCase();
}

const linked = new Map<string, number | null>();
/** Identity without grade: every grade of the same card shares one product. */
const linkKey = (card: Card) => [card.setCode ?? '', card.number ?? '', card.language || 'en', card.name].join(':');

/** The catalog card for a vault card, or null when it can't be found. Kept for the app run. */
export async function catalogFor(card: Card): Promise<CatalogCard | null> {
  // Sealed product knows its product id.
  if (card.sealed && card.productId) return catalogCard(card.productId);
  const key = linkKey(card);
  if (linked.has(key)) {
    const id = linked.get(key);
    return id == null ? null : catalogCard(id);
  }
  let found: CatalogCard | null = null;
  if (!supabase) {
    found = (catalogJson as CatalogCard[]).find((c) => sameCard(c, card)) ?? null;
  } else {
    // A network error throws out of here so the next open tries again; only a real miss is kept.
    const { data, error } = await supabase.from('card_refs').select('tcgplayer_id').eq('card_key', cardKey(card)).maybeSingle();
    if (error) throw error;
    const id = Number(data?.tcgplayer_id);
    if (id > 0) found = await catalogCard(id);
    // Vault names carry words TCGplayer doesn't ("alt art"), so search by set code and number,
    // then by the first word of the name and the number.
    const no = cardNumber(card.number);
    for (const q of no ? [card.setCode && `${card.setCode} ${no}`, `${card.name.split(/\s+/)[0]} ${no}`] : []) {
      if (found || !q) continue;
      const hits = await searchCards(q, card.game ?? null);
      found = hits.find((c) => sameCard(c, card)) ?? null;
    }
  }
  linked.set(key, found?.productId ?? null);
  return found;
}
