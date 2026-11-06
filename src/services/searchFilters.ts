// Search with filters and sorts (0009_search_filters.sql). Filtering and sorting run in the
// database over the whole catalog, so "Japanese" or "Biggest rise" look at every card, not just
// the first page of matches. Without Supabase configured, everything runs on the mock catalog.

import catalogJson from '../mocks/catalog.json';
import { displayName, matches, terms, type CatalogCard, type Game } from './search';
import { supabase } from './supabase';

export type Sort = 'best' | 'price_high' | 'price_low' | 'name' | 'rise_7d' | 'drop_7d' | 'rise_30d' | 'drop_30d';

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'best', label: 'Best match' },
  { value: 'price_high', label: 'Price high' },
  { value: 'price_low', label: 'Price low' },
  { value: 'rise_7d', label: 'Biggest rise, 7 days' },
  { value: 'drop_7d', label: 'Biggest drop, 7 days' },
  { value: 'rise_30d', label: 'Biggest rise, 30 days' },
  { value: 'drop_30d', label: 'Biggest drop, 30 days' },
  { value: 'name', label: 'Name' },
];

export type Query = {
  q: string;
  game: Game | null;
  language: 'en' | 'ja' | null;
  /** A set (TCGplayer group). With a set picked, an empty search browses the whole set. */
  set: { id: number; name: string } | null;
  rarities: string[];
  sort: Sort;
};

export const EMPTY_QUERY: Query = { q: '', game: null, language: null, set: null, rarities: [], sort: 'best' };

export type Found = CatalogCard & { change7d: number | null; change30d: number | null };

export type Facets = {
  languages: { key: string; n: number }[];
  sets: { id: number; name: string; n: number }[];
  rarities: { key: string; n: number }[];
};

/** How many filters are on (the Filter button shows it). Game has its own tabs. */
export function filterCount(f: Query): number {
  return (f.language ? 1 : 0) + (f.set ? 1 : 0) + f.rarities.length;
}

/** A query is worth running once it has two characters, or a set to browse. */
export function runnable(f: Query): boolean {
  return f.q.trim().length >= 2 || !!f.set;
}

/** Which change a sort uses, if any. */
export function changeOf(sort: Sort): 'change7d' | 'change30d' | null {
  if (sort === 'rise_7d' || sort === 'drop_7d') return 'change7d';
  if (sort === 'rise_30d' || sort === 'drop_30d') return 'change30d';
  return null;
}

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
  change_7d: number | null;
  change_30d: number | null;
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

export async function findCards(f: Query): Promise<Found[]> {
  if (!runnable(f)) return [];
  if (!supabase) return mockFind(f);
  const { data, error } = await supabase.rpc('search_catalog', {
    q: f.q.trim(),
    game_filter: f.game,
    lim: 60,
    lang_filter: f.language,
    group_filter: f.set?.id ?? null,
    rarity_filter: f.rarities.length ? f.rarities : null,
    sort: f.sort,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function findFacets(f: Query): Promise<Facets> {
  if (!terms(f.q).length) return { languages: [], sets: [], rarities: [] };
  if (!supabase) return mockFacets(f);
  const { data, error } = await supabase.rpc('search_facets', { q: f.q.trim(), game_filter: f.game, lang_filter: f.language });
  if (error) throw error;
  return facetsFrom((data ?? []) as { kind: string; key: string; label: string; n: number }[]);
}

export function facetsFrom(rows: { kind: string; key: string; label: string; n: number }[]): Facets {
  const out: Facets = { languages: [], sets: [], rarities: [] };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.kind === 'language') out.languages.push({ key: r.key, n });
    else if (r.kind === 'set') out.sets.push({ id: Number(r.key), name: r.label, n });
    else if (r.kind === 'rarity') out.rarities.push({ key: r.key, n });
  }
  for (const list of [out.languages, out.sets, out.rarities] as { n: number }[][]) list.sort((a, b) => b.n - a.n);
  return out;
}

/** Sets imported so far vs all sets: under 100% the catalog is still loading for the first time. */
export async function catalogProgress(): Promise<{ done: number; total: number } | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('catalog_status');
  const r = (data as { sets_total: number; sets_done: number }[] | null)?.[0];
  return r ? { done: r.sets_done, total: r.sets_total } : null;
}

// ── mocks ────────────────────────────────────────────────────────────────────────────────────

type Mock = CatalogCard & { mock: unknown };
const mockCatalog = catalogJson as Mock[];

/** Mock price change: fixed per card so sorts are stable. */
const mockChange = (id: number, days: number) => (((id * 7) % 11) - 5) / (days === 7 ? 60 : 25);

const asFound = (c: Mock): Found => {
  const { mock: _mock, ...card } = c;
  return { ...card, change7d: mockChange(c.productId, 7), change30d: mockChange(c.productId, 30) };
};

function mockMatches(c: Mock, f: Query, ignore: 'language' | 'set' | 'rarity' | null = null): boolean {
  if (f.game && c.game !== f.game) return false;
  if (ignore !== 'language' && f.language && c.language !== f.language) return false;
  if (ignore !== 'set' && f.set && `${c.setName}` !== f.set.name) return false;
  if (ignore !== 'rarity' && f.rarities.length && !f.rarities.includes(c.rarity ?? '')) return false;
  return terms(f.q).length ? matches(c, f.q) : !!f.set;
}

export function sortFound(list: Found[], sort: Sort): Found[] {
  const out = [...list];
  const key = changeOf(sort);
  if (key) {
    const dir = sort.startsWith('rise') ? -1 : 1;
    return out.filter((c) => c[key] != null).sort((a, b) => dir * (a[key]! - b[key]!));
  }
  if (sort === 'name') return out.sort((a, b) => displayName(a.name).localeCompare(displayName(b.name)));
  if (sort === 'price_high' || sort === 'price_low') {
    const dir = sort === 'price_high' ? -1 : 1;
    return out.sort((a, b) => {
      if (a.marketCents == null) return b.marketCents == null ? 0 : 1;
      if (b.marketCents == null) return -1;
      return dir * (a.marketCents - b.marketCents);
    });
  }
  return out;
}

function mockFind(f: Query): Found[] {
  return sortFound(mockCatalog.filter((c) => mockMatches(c, f)).map(asFound), f.sort);
}

function mockFacets(f: Query): Facets {
  const rows: { kind: string; key: string; label: string; n: number }[] = [];
  const count = (kind: string, list: Mock[], key: (c: Mock) => string | null, label: (c: Mock) => string) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const c of list) {
      const k = key(c);
      if (k == null) continue;
      m.set(k, { label: label(c), n: (m.get(k)?.n ?? 0) + 1 });
    }
    for (const [k, v] of m) rows.push({ kind, key: k, label: v.label, n: v.n });
  };
  const base = { ...f, set: null, rarities: [] };
  count('language', mockCatalog.filter((c) => mockMatches(c, base, 'language')), (c) => c.language, (c) => c.language);
  const inLang = mockCatalog.filter((c) => mockMatches(c, base));
  count('set', inLang, (c) => String(setId(c.setName)), (c) => c.setName);
  count('rarity', inLang, (c) => c.rarity, (c) => c.rarity ?? '');
  return facetsFrom(rows);
}

/** Mock set ids: stable per set name. */
export function setId(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}
