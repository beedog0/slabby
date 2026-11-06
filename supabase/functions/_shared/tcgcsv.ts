// TCGplayer catalog and prices via TCGCSV (the source Fairmark's index is built from). No key needed.
// Pokémon: fallback for cards PokemonPriceTracker's search misses, mostly Japanese promos (SV-P, S-P...).
// One Piece and Riftbound: the only source. PPT is Pokémon-only, so these games get their art and
// raw TCGplayer market price here.

import { numberMatches } from './comps-math.ts';

const TCGCSV = 'https://tcgcsv.com/tcgplayer';
const UA = { 'User-Agent': 'slabby-card-match/0.1 (+https://github.com/beedog0/slabby)' };

type Category = { categoryId: number; name: string; displayName?: string };
type Group = { groupId: number; name: string; abbreviation?: string | null };
type Product = { productId: number; name: string; imageUrl?: string; extendedData?: { name: string; value: string }[] };
export type TcgPrice = { productId: number; marketPrice: number | null; lowPrice: number | null; subTypeName?: string };

async function results<T>(path: string): Promise<T[]> {
  const res = await fetch(`${TCGCSV}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`tcgcsv_${res.status}`);
  return ((await res.json()) as { results: T[] }).results ?? [];
}

const compact = (t: string | null | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Pokémon's ids are long-standing. Other games are looked up by name once per function instance,
// so a new or renamed TCGplayer category doesn't need a code change.
const KNOWN: Record<string, number> = { 'pokemon:en': 3, 'pokemon:ja': 85 };
const NAMES: Record<string, RegExp> = { pokemon: /pok[eé]mon/i, onepiece: /one\s*piece/i, riftbound: /riftbound|league of legends/i };
const JAPANESE = /japan/i;
let categories: Promise<Category[]> | null = null;

/** TCGplayer category for a game and language. Null when TCGplayer doesn't sell that language. */
export async function categoryFor(game: string, language: string): Promise<number | null> {
  const known = KNOWN[`${game}:${language === 'ja' ? 'ja' : 'en'}`];
  if (known) return known;
  const want = NAMES[game];
  if (!want) return null;
  categories ??= results<Category>('/categories').catch((e) => {
    categories = null;
    throw e;
  });
  const all = (await categories).filter((c) => want.test(`${c.name} ${c.displayName ?? ''}`));
  const isJa = (c: Category) => JAPANESE.test(`${c.name} ${c.displayName ?? ''}`);
  // Only English and Japanese have their own TCGplayer categories.
  const hit = language === 'ja' ? all.find(isJa) : language === 'en' ? all.find((c) => !isJa(c)) : undefined;
  return hit?.categoryId ?? null;
}

export type TcgMatch = {
  tcgPlayerId: string;
  image: string;
  setName: string;
  category: number;
  group: number;
  /** False when the product is another language's printing: good for the photo, not the price. */
  priced: boolean;
};

type MatchInput = { game?: string; variety?: string | null; name: string; number: string | null; language: string; setCode?: string | null; setName?: string | null };

/** Find a product by set code + card number, scored by name. Null when the set or number isn't there. */
export async function tcgcsvMatch(c: MatchInput): Promise<TcgMatch | null> {
  const game = c.game ?? 'pokemon';
  const category = await categoryFor(game, c.language);
  if (category) {
    const m = await matchIn(category, c);
    if (m) return { ...m, priced: true };
  }
  // Chinese Riftbound or Japanese One Piece with no TCGplayer category of its own: the English
  // printing has the same art, so use its photo but don't price the card from it.
  if (game !== 'pokemon' && c.language !== 'en') {
    const en = await categoryFor(game, 'en');
    const m = en && en !== category ? await matchIn(en, c) : null;
    if (m) return { ...m, priced: false };
  }
  return null;
}

async function matchIn(category: number, c: MatchInput) {
  if (!c.number || (!c.setCode && !c.setName)) return null;
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
    return n && numberMatches(n, c.number);
  });
  if (!hits.length) return null;
  const nameWords = c.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const bare = (c.number ?? '').replace(/^0+(?=\d)/, '');
  const byVariety = (c.game ?? 'pokemon') !== 'pokemon'; // Pokémon numbers are unique per printing
  const variant = varietyWords(c.variety);
  const score = (p: Product) => {
    const n = p.name.toLowerCase();
    const tagged = /\(|\[/.test(n); // "Monkey.D.Luffy (Parallel)", "Shanks (Manga)"
    const fits = variant.filter((w) => n.includes(w)).length;
    return (
      // The title carries the printed number ("Pikachu - 120/SV-P"); reprint rows sometimes don't.
      (new RegExp(`\\b0*${escape(bare)}\\s*/`).test(n) ? 5 : 0) +
      nameWords.filter((w) => n.includes(w)).length +
      // One Piece and Riftbound reuse the number for parallels and alt arts, so the label's variety
      // picks the printing: tagged rows only when the label names one, the plain row otherwise.
      (!byVariety ? 0 : variant.length ? (fits ? 3 * fits : tagged ? -1 : -2) : tagged ? -2 : 0)
    );
  };
  const best = hits.sort((a, b) => score(b) - score(a))[0];
  return {
    tcgPlayerId: String(best.productId),
    image: `https://tcgplayer-cdn.tcgplayer.com/product/${best.productId}_400w.jpg`,
    setName: group.name,
    category,
    group: group.groupId,
  };
}

// PSA and TCGplayer word variants differently ("PARALLEL" vs "Alternate Art"), so both count.
const SAME: Record<string, string[]> = { parallel: ['parallel', 'alternate', 'alt'], alternate: ['parallel', 'alternate', 'alt'], alt: ['parallel', 'alternate', 'alt'] };
function varietyWords(v: string | null | undefined): string[] {
  const words = (v ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !['art', 'rare', 'holo', 'the'].includes(w));
  return [...new Set(words.flatMap((w) => SAME[w] ?? [w]))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Per function run: a set's prices file covers all its cards, so nightly fetches it once.
const groupPrices = new Map<string, Promise<TcgPrice[]>>();

/** Today's TCGplayer market for one product, in dollars. Null when TCGplayer has no market price. */
export async function tcgcsvMarket(category: number, group: number, productId: string): Promise<number | null> {
  const path = `/${category}/${group}/prices`;
  if (!groupPrices.has(path)) groupPrices.set(path, results<TcgPrice>(path).catch((e) => (groupPrices.delete(path), Promise.reject(e))));
  const prices = await groupPrices.get(path)!;
  const rows = prices.filter((p) => String(p.productId) === productId && p.marketPrice != null && p.marketPrice > 0);
  // A product can have Normal and Foil rows; take the lower so the floor is never inflated.
  return rows.length ? Math.min(...rows.map((r) => r.marketPrice as number)) : null;
}
