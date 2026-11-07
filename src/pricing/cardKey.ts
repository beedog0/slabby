import type { Card } from '../types';

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Identity of a card independent of whose copy it is, so two users holding the same slab
 * share price history. Format: grader:grade:setCode:number:language, e.g. "psa:10:SV2a:205:ja".
 * Other games add the game at the end ("psa:10:OP05:119:ja:onepiece"), then the variety when there
 * is one ("…:onepiece:parallel"), because their parallels and alt arts share the card number.
 * Pokémon keys stay as they were so existing price history still lines up. Edge Functions read grader and grade from the
 * front, so the game must never go first.
 */
export function cardKey(
  c: Pick<Card, 'grader' | 'grade' | 'setCode' | 'number' | 'language' | 'game' | 'variety'> & {
    setName?: string | null;
    sealed?: Card['sealed'];
    productId?: Card['productId'];
  },
): string {
  // Sealed product is one TCGplayer product, priced from the catalog by its id. Edge Functions
  // never see these keys (no card-match, no comps-refresh).
  if (c.sealed && c.productId) return `sealed:${c.productId}`;
  // A Pokémon card with no set code ("2016 POKEMON XY EVOLUTIONS", "2021 POKEMON JPN 25TH
  // ANNIV-GOLDEN BOX") is keyed by its set name instead, or every #11 PSA 10 in the language would
  // share one match and one price.
  const pokemon = !c.game || c.game === 'pokemon';
  const set = c.setCode || (pokemon ? slug(c.setName ?? '') : '');
  const parts = [c.grader, c.grade ?? '', set, c.number ?? '', c.language || 'en'];
  if (c.game && c.game !== 'pokemon') {
    parts.push(c.game);
    const v = slug(c.variety ?? '');
    if (v) parts.push(v);
  }
  return parts.join(':');
}
