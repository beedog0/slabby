// Sets from our own catalog (TCGplayer groups, 0008/0010): the cards in a set for the set page and
// "More from this set" on a card. Postgres only; no PokemonPriceTracker credits.
//
// Set logos and release info come from the free Pokémon TCG API (pokemontcg.io), matched by set
// name. It only covers English Pokémon sets; Japanese, One Piece and Riftbound sets fall back to a
// typographic title. The set list is fetched once and kept a week on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogJson from '../mocks/catalog.json';
import type { CatalogCard } from './search';
import { setId, type Found } from './searchFilters';
import { supabase } from './supabase';

type Mock = CatalogCard & { mock: unknown };
const COLS = 'product_id, game, language, name, number, rarity, set_name, set_code, image_url, market_cents, low_cents, change_7d, change_30d, group_id';

type Row = {
  product_id: number;
  game: CatalogCard['game'];
  language: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set_name: string;
  set_code: string | null;
  image_url: string | null;
  market_cents: number | null;
  low_cents: number | null;
  change_7d: number | null;
  change_30d: number | null;
  group_id: number;
};

const fromRow = (r: Row): Found => ({
  productId: r.product_id,
  game: r.game,
  language: r.language,
  name: r.name,
  number: r.number,
  rarity: r.rarity,
  setName: r.set_name,
  setCode: r.set_code,
  imageUrl: r.image_url,
  marketCents: r.market_cents,
  lowCents: r.low_cents,
  change7d: r.change_7d ?? null,
  change30d: r.change_30d ?? null,
});

const mockFound = (c: Mock): Found => {
  const { mock: _m, ...card } = c;
  return { ...card, change7d: (((c.productId * 7) % 11) - 5) / 60, change30d: null };
};

/** The set a card belongs to (its TCGplayer group id). */
export async function groupOf(card: CatalogCard): Promise<number | null> {
  if (!supabase) return setId(card.setName);
  const { data } = await supabase.from('catalog').select('group_id').eq('product_id', card.productId).maybeSingle();
  return data?.group_id ?? null;
}

/** Up to `n` other cards from the same set, highest market first. */
export async function setCards(card: CatalogCard, n = 12): Promise<{ groupId: number | null; cards: Found[] }> {
  const groupId = await groupOf(card);
  if (groupId == null) return { groupId, cards: [] };
  const all = await cardsInSet(groupId, n + 1);
  return { groupId, cards: all.filter((c) => c.productId !== card.productId && c.marketCents != null).slice(0, n) };
}

/**
 * One booster pack of a set and its TCGplayer market (0013_pack_prices.sql), for "Pulled it" on
 * the sell page. Null when the set has none, or before the column exists: a pull is then $0.
 */
export async function packFor(groupId: number): Promise<{ name: string; cents: number } | null> {
  if (!supabase) return { name: 'Booster Pack', cents: 499 };
  const { data, error } = await supabase.from('catalog_groups').select('pack_name, pack_cents').eq('group_id', groupId).limit(1).maybeSingle();
  if (error || !data?.pack_cents) return null;
  return { name: (data.pack_name as string | null) ?? 'Booster pack', cents: data.pack_cents as number };
}

/** Every single in a set (up to 600), highest market first. */
export async function cardsInSet(groupId: number, limit = 600): Promise<Found[]> {
  if (!supabase) {
    return (catalogJson as Mock[])
      .filter((c) => setId(c.setName) === groupId && !!c.number)
      .sort((a, b) => (b.marketCents ?? -1) - (a.marketCents ?? -1))
      .slice(0, limit)
      .map(mockFound);
  }
  const { data, error } = await supabase
    .from('catalog')
    .select(COLS)
    .eq('group_id', groupId)
    // Singles only: sealed product (0015) has no card number.
    .not('number', 'is', null)
    .order('market_cents', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

// ── set sorting and filtering (pure) ────────────────────────────────────────────────────────

export type SetSort = 'price_high' | 'price_low' | 'number' | 'name' | 'rarity' | 'rising' | 'falling';
export const SET_SORTS: { value: SetSort; label: string }[] = [
  { value: 'price_high', label: 'Price high' },
  { value: 'price_low', label: 'Price low' },
  { value: 'number', label: 'Number' },
  { value: 'name', label: 'Name' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'rising', label: 'Rising, 7 days' },
  { value: 'falling', label: 'Falling, 7 days' },
];

/** "205/165" → 205, "SV-P 045" → 45, "TG12" → 12. Letters-only sort last. */
export function numberKey(n: string | null): number {
  const m = (n ?? '').split('/')[0].match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

const byNumber = (a: Found, b: Found) => numberKey(a.number) - numberKey(b.number) || (a.number ?? '').localeCompare(b.number ?? '');

/** Sort the set, then keep only the picked rarities (none picked = all). The two work together. */
export function arrangeSet(cards: Found[], sort: SetSort, picked: string[] = []): Found[] {
  const kept = picked.length ? cards.filter((c) => c.rarity != null && picked.includes(c.rarity)) : [...cards];
  switch (sort) {
    case 'number':
      return kept.sort(byNumber);
    case 'name':
      return kept.sort((a, b) => a.name.localeCompare(b.name) || byNumber(a, b));
    case 'rarity': {
      // Rarest first: rarities with the fewest cards in the set lead, priciest first within.
      const n = new Map(rarities(cards).map((r) => [r.rarity, r.n]));
      const rank = (c: Found) => (c.rarity ? n.get(c.rarity) ?? 0 : Number.MAX_SAFE_INTEGER);
      return kept.sort((a, b) => rank(a) - rank(b) || (a.rarity ?? '').localeCompare(b.rarity ?? '') || (b.marketCents ?? -1) - (a.marketCents ?? -1));
    }
    case 'rising':
    case 'falling': {
      const dir = sort === 'rising' ? -1 : 1;
      return kept.filter((c) => c.change7d != null).sort((a, b) => dir * ((a.change7d ?? 0) - (b.change7d ?? 0)));
    }
    case 'price_low':
      return kept.filter((c) => c.marketCents != null).sort((a, b) => (a.marketCents ?? 0) - (b.marketCents ?? 0));
    default:
      return kept.sort((a, b) => (b.marketCents ?? -1) - (a.marketCents ?? -1));
  }
}

/** Rarities in the set, most cards first. */
export function rarities(cards: Found[]): { rarity: string; n: number }[] {
  const by = new Map<string, number>();
  for (const c of cards) if (c.rarity) by.set(c.rarity, (by.get(c.rarity) ?? 0) + 1);
  return [...by].map(([rarity, n]) => ({ rarity, n })).sort((a, b) => b.n - a.n);
}

// ── set logo and release info ───────────────────────────────────────────────────────────────

export type SetMeta = { logo: string | null; symbol: string | null; series: string | null; releaseDate: string | null; total: number | null };
type ApiSet = { id: string; name: string; series: string; releaseDate: string; printedTotal: number; total: number; images: { logo: string; symbol: string } };

const STORE_KEY = 'slabby.sets.v1';
const WEEK = 7 * 24 * 3_600_000;
let memo: Promise<ApiSet[]> | null = null;

/** TCGplayer names sets "SWSH07: Evolving Skies", "SV: Scarlet & Violet 151"; the API says "Evolving Skies", "151". */
export function setKey(name: string): string {
  return name
    .replace(/^[A-Za-z0-9.\- ]{1,10}:\s+/, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/pok[eé]mon/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES: Record<string, string> = { scarletandviolet151: '151', scarletandvioletbaseset: 'scarletandviolet', swordandshieldbaseset: 'swordandshield' };

export function matchSet<T extends { name: string }>(sets: T[], setName: string): T | null {
  const k = setKey(setName);
  const want = ALIASES[k] ?? k;
  return sets.find((s) => setKey(s.name) === want) ?? null;
}

async function apiSets(): Promise<ApiSet[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      const { at, sets } = JSON.parse(raw) as { at: number; sets: ApiSet[] };
      if (Date.now() - at < WEEK && sets.length) return sets;
    }
  } catch {}
  const res = await fetch('https://api.pokemontcg.io/v2/sets?pageSize=250&select=id,name,series,releaseDate,printedTotal,total,images');
  if (!res.ok) throw new Error(`sets_${res.status}`);
  const sets = ((await res.json()) as { data: ApiSet[] }).data ?? [];
  AsyncStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), sets })).catch(() => {});
  return sets;
}

/** Logo and release info for an English Pokémon set; null for anything the API doesn't cover. */
export async function setMeta(card: Pick<CatalogCard, 'setName' | 'language' | 'game'>): Promise<SetMeta | null> {
  if (card.game !== 'pokemon' || card.language !== 'en') return null;
  memo ??= apiSets().catch((e) => {
    memo = null;
    throw e;
  });
  const s = matchSet(await memo, card.setName);
  if (!s) return null;
  return { logo: s.images?.logo ?? null, symbol: s.images?.symbol ?? null, series: s.series ?? null, releaseDate: s.releaseDate ?? null, total: s.printedTotal ?? s.total ?? null };
}
