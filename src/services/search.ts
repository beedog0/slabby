// Card search over our own copy of TCGplayer's catalog (0008_card_search.sql). Typing only reads
// Postgres; prices for raw and PSA 10/9/8 load when a card is opened (card-prices, cached 24 h
// on the server). Without Supabase configured, both run on src/mocks/catalog.json.

import catalogJson from '../mocks/catalog.json';
import pricesJson from '../mocks/prices.json';
import type { CardPrice } from './comps';
import { supabase } from './supabase';

export type Game = 'pokemon' | 'onepiece' | 'riftbound';

export type CatalogCard = {
  productId: number;
  game: Game;
  language: string;
  name: string;
  number: string | null;
  rarity: string | null;
  setName: string;
  setCode: string | null;
  imageUrl: string | null;
  marketCents: number | null;
  lowCents: number | null;
};

export const SEARCH_GRADES = ['psa10', 'psa9', 'psa8'] as const;
export type SearchGrade = (typeof SEARCH_GRADES)[number];

export type SearchPrices = {
  raw: CardPrice | null;
  grades: Partial<Record<SearchGrade, CardPrice | null>>;
  fetchedAt: string;
  source: 'ppt' | 'catalog';
  capped?: boolean;
};

type MockCard = CatalogCard & { mock: Record<SearchGrade, number> | null };
const mockCatalog = catalogJson as MockCard[];

type Row = {
  product_id: number;
  game: Game;
  language: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set_name: string;
  set_code: string | null;
  image_url: string | null;
  market_cents: number | null;
  low_cents: number | null;
};

const fromRow = (r: Row): CatalogCard => ({
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
});

/** Words a search is split into; "#205" and "205/165" both search the number. */
export function terms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[#/,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Mock search: every word must appear in name, set, set code or number (same rule as SQL). */
export function matches(c: Pick<CatalogCard, 'name' | 'setName' | 'setCode' | 'number'>, q: string): boolean {
  const hay = `${c.name} ${c.setName} ${c.setCode ?? ''} ${c.number ?? ''}`.toLowerCase();
  const t = terms(q);
  return t.length > 0 && t.every((w) => hay.includes(w));
}

const cache = new Map<number, CatalogCard>();

/** Cards matching the search, best match first. Empty for an empty search. */
export async function searchCards(q: string, game: Game | null): Promise<CatalogCard[]> {
  if (!terms(q).length) return [];
  let out: CatalogCard[];
  if (!supabase) {
    out = mockCatalog.filter((c) => (!game || c.game === game) && matches(c, q));
  } else {
    const { data, error } = await supabase.rpc('search_catalog', { q, game_filter: game, lim: 40 });
    if (error) throw error;
    out = ((data ?? []) as Row[]).map(fromRow);
  }
  for (const c of out) cache.set(c.productId, c);
  return out;
}

/** A card seen in this run's results (the card page opens from the list without a refetch). */
export async function catalogCard(productId: number): Promise<CatalogCard | null> {
  if (cache.has(productId)) return cache.get(productId)!;
  if (!supabase) return mockCatalog.find((c) => c.productId === productId) ?? null;
  const { data } = await supabase.from('catalog').select('*').eq('product_id', productId).maybeSingle();
  if (!data) return null;
  const c = fromRow(data as Row);
  cache.set(productId, c);
  return c;
}

const opened = new Map<number, SearchPrices>();

/** Raw and PSA 10/9/8 prices with history for a searched card. Kept for the app run. */
export async function openPrices(productId: number): Promise<SearchPrices | null> {
  if (opened.has(productId)) return opened.get(productId)!;
  let p: SearchPrices | null;
  if (!supabase) p = mockPrices(productId);
  else {
    const { data, error } = await supabase.functions.invoke<SearchPrices>('card-prices', { body: { productId } });
    p = error ? null : data ?? null;
  }
  if (p) opened.set(productId, p);
  return p;
}

// ── mocks ────────────────────────────────────────────────────────────────────────────────────

const shape = (pricesJson as Record<string, CardPrice>)['psa:10:EVS:215:en'];

/** A CardPrice whose series has the mock template's shape, scaled to end at `cents`. */
export function scaled(cents: number, sales30d: number): CardPrice {
  const k = cents / shape.marketCents;
  const series90 = shape.series90.map((v) => Math.round(v * k));
  series90[series90.length - 1] = cents;
  return {
    marketCents: cents,
    lowCents: Math.round(shape.lowCents * k),
    highCents: Math.round(shape.highCents * k),
    sales30d,
    asOf: shape.asOf,
    series90,
  };
}

function mockPrices(productId: number): SearchPrices | null {
  const c = mockCatalog.find((m) => m.productId === productId);
  if (!c) return null;
  const raw = c.marketCents != null ? scaled(c.marketCents, 0) : null;
  if (!c.mock) return { raw: raw && { ...raw, series90: [raw.marketCents] }, grades: {}, fetchedAt: shape.asOf, source: 'catalog' };
  return {
    raw,
    grades: { psa10: scaled(c.mock.psa10, 24), psa9: scaled(c.mock.psa9, 41), psa8: scaled(c.mock.psa8, 17) },
    fetchedAt: shape.asOf,
    source: 'ppt',
  };
}

/** TCGplayer titles carry the number ("Mew ex - 205/165"); the vault shows the name alone. */
export function displayName(name: string): string {
  return name.replace(/\s+-\s+(?=[\w/-]*\d)[\w/-]+$/, '').trim();
}

/** The printed number without the set size: "205/165" → "205". One Piece "OP05-119" stays. */
export function cardNumber(n: string | null): string {
  return (n ?? '').split('/')[0].trim();
}

/** Params for the Add a slab screen, prefilled from a searched card at the chosen grade. */
export function addParams(c: CatalogCard, grade: SearchGrade | 'raw'): Record<string, string> {
  return {
    game: c.game,
    name: displayName(c.name),
    set: c.setName,
    setCode: c.setCode ?? '',
    number: cardNumber(c.number),
    language: c.language === 'ja' ? 'ja' : 'en',
    grader: grade === 'raw' ? 'raw' : 'psa',
    grade: grade === 'raw' ? '' : grade.replace('psa', ''),
    productId: String(c.productId),
    image: c.imageUrl ?? '',
  };
}
