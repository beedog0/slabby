// TCGplayer catalog via TCGCSV (the source Fairmark's index is built from). No key needed.
// Fallback for cards PokemonPriceTracker's search misses, mostly Japanese promos (SV-P, S-P...).
// Categories: 3 = Pokémon (English), 85 = Pokémon Japan.

import { bareNumber } from './comps-math.ts';

const TCGCSV = 'https://tcgcsv.com/tcgplayer';
const UA = { 'User-Agent': 'slabby-card-match/0.1 (+https://github.com/beedog0/slabby)' };

type Group = { groupId: number; name: string; abbreviation?: string | null };
type Product = { productId: number; name: string; imageUrl?: string; extendedData?: { name: string; value: string }[] };

async function results<T>(path: string): Promise<T[]> {
  const res = await fetch(`${TCGCSV}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`tcgcsv_${res.status}`);
  return ((await res.json()) as { results: T[] }).results ?? [];
}

const compact = (t: string | null | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Find a product by set code + card number, scored by name. Null when the set or number isn't there. */
export async function tcgcsvMatch(c: { name: string; number: string | null; language: string; setCode?: string | null; setName?: string | null }) {
  const want = bareNumber(c.number);
  if (!want || (!c.setCode && !c.setName)) return null;
  const category = c.language === 'ja' ? 85 : 3;
  const groups = await results<Group>(`/${category}/groups`);
  const code = compact(c.setCode);
  const group =
    (code && groups.find((g) => compact(g.abbreviation) === code)) ||
    (code && groups.find((g) => compact(g.name).startsWith(code))) ||
    (c.setName && groups.find((g) => compact(g.name).includes(compact(c.setName))));
  if (!group) return null;

  const products = await results<Product>(`/${category}/${group.groupId}/products`);
  const hits = products.filter((p) => {
    const n = p.extendedData?.find((e) => e.name === 'Number')?.value;
    return n && bareNumber(n) === want;
  });
  if (!hits.length) return null;
  const nameWords = c.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const score = (p: Product) => {
    const n = p.name.toLowerCase();
    // The title carries the printed number ("Pikachu - 120/SV-P"); reprint rows sometimes don't.
    return (new RegExp(`\\b0*${want}\\s*/`).test(n) ? 5 : 0) + nameWords.filter((w) => n.includes(w)).length;
  };
  const best = hits.sort((a, b) => score(b) - score(a))[0];
  return {
    tcgPlayerId: String(best.productId),
    image: `https://tcgplayer-cdn.tcgplayer.com/product/${best.productId}_400w.jpg`,
    setName: group.name,
  };
}
