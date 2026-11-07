// Pure helpers for the card catalog (search) and the card-prices answer. Shared by the Edge
// Functions and unit-tested from the app (jest). No imports: this file must run unchanged in Deno
// and Node.
//
// Catalog source: TCGCSV, a daily copy of TCGplayer's catalog and market prices.

/** TCGplayer categories we import. Games match src/lib/games (pokemon | onepiece | riftbound). */
export const CATEGORIES = [
  { id: 3, game: 'pokemon', language: 'en' },
  { id: 85, game: 'pokemon', language: 'ja' },
  { id: 68, game: 'onepiece', language: 'en' },
  { id: 89, game: 'riftbound', language: 'en' },
] as const;

export type TcgProduct = {
  productId: number;
  name: string;
  cleanName?: string | null;
  imageUrl?: string | null;
  groupId: number;
  extendedData?: { name: string; value: string }[];
};

export type TcgPrice = {
  productId: number;
  subTypeName?: string | null;
  marketPrice?: number | null;
  lowPrice?: number | null;
  midPrice?: number | null;
};

export type CatalogRow = {
  product_id: number;
  category_id: number;
  group_id: number;
  game: string;
  language: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set_name: string;
  set_code: string | null;
  image_url: string;
  market_cents: number | null;
  low_cents: number | null;
  /** Every priced printing (Normal, Holofoil, Reverse Holofoil, 1st Edition…), the base one first. */
  printings: Printing[];
  /** Sealed product (0015_sealed.sql): what kind, e.g. "booster_box". Null for a single card. */
  sealed_type: SealedType | null;
};

/** Kinds of sealed product, in the order the filter lists them. */
export const SEALED_TYPES = [
  'booster_box',
  'etb',
  'booster_bundle',
  'booster_pack',
  'blister',
  'tin',
  'collection',
  'deck',
  'case',
] as const;
export type SealedType = (typeof SEALED_TYPES)[number];

/** Accessories and codes: not something collectors hold sealed for its value. */
const NOT_SEALED =
  /code card|online code|\bcodes?\b|jumbo|oversize|card sleeves|\bsleeves\b|binder|portfolio|playmat|deck box|\bdice\b|damage counter|storage|album|poster|\bcoin\b(?!.*\b(collection|box|tin)\b)|\bpins?\b(?!.*\b(collection|box)\b)|\bfigure\b(?!.*\b(collection|box)\b)/i;

/**
 * What kind of sealed product a TCGplayer product is, from its name, or null when it is a single
 * card or an accessory. Only products with no card number and no rarity get here. Order matters:
 * "Booster Box Case" is a case, "Elite Trainer Box" an ETB, "Sleeved Booster Pack" a pack.
 */
export function sealedType(name: string): SealedType | null {
  const n = name.toLowerCase();
  if (NOT_SEALED.test(n)) return null;
  if (/\bcase\b/.test(n)) return 'case';
  if (/elite trainer box|\betb\b/.test(n)) return 'etb';
  if (/booster box|booster display|display box|\bdisplay\b/.test(n)) return 'booster_box';
  if (/booster bundle/.test(n)) return 'booster_bundle';
  if (/blister|checklane|check lane/.test(n)) return 'blister';
  if (/booster pack|\bpack\b/.test(n)) return 'booster_pack';
  if (/\btins?\b/.test(n)) return 'tin';
  if (/\bdeck\b/.test(n)) return 'deck';
  if (/collection|\bbox\b|premium|bundle|\bkit\b|toolkit|stadium|gift set|\bchest\b/.test(n)) return 'collection';
  return null;
}

export type Printing = { name: string; market_cents: number | null; low_cents: number | null };

const ext = (p: TcgProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value?.trim() || null;
const cents = (d: number | null | undefined) => (d != null && d > 0 ? Math.round(d * 100) : null);

/**
 * The one price that stands for a card. A product can carry several printings (Normal, Holofoil,
 * Reverse Holofoil, 1st Edition…); the base printing is what a graded slab is usually of, so
 * reverse holos are passed over unless they are all there is. Highest market among the rest.
 */
export function primaryPrice(prices: TcgPrice[]): { market_cents: number | null; low_cents: number | null } {
  const priced = prices.filter((p) => cents(p.marketPrice) != null || cents(p.lowPrice) != null);
  const base = priced.filter((p) => !/reverse/i.test(p.subTypeName ?? ''));
  const pool = base.length ? base : priced;
  if (!pool.length) return { market_cents: null, low_cents: null };
  const best = [...pool].sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0))[0];
  return { market_cents: cents(best.marketPrice), low_cents: cents(best.lowPrice) };
}

/**
 * A product's printings with their prices, the one primaryPrice picked first, the rest by market.
 * Raw card scans can't tell a reverse holo from a holo, so the scan sheet lets you pick from these.
 */
export function printings(prices: TcgPrice[]): Printing[] {
  const priced = prices
    .filter((p) => p.subTypeName && (cents(p.marketPrice) != null || cents(p.lowPrice) != null))
    .map((p) => ({ name: p.subTypeName!.trim(), market_cents: cents(p.marketPrice), low_cents: cents(p.lowPrice) }));
  const base = primaryPrice(prices);
  return priced.sort((a, b) => {
    const ab = a.market_cents === base.market_cents ? 1 : 0;
    const bb = b.market_cents === base.market_cents ? 1 : 0;
    return bb - ab || (b.market_cents ?? 0) - (a.market_cents ?? 0);
  });
}

/**
 * Catalog rows for one set: every single, plus sealed product (booster boxes, ETBs, packs, tins,
 * collection boxes) tagged with its sealed_type. Sealed product has no card number or rarity on
 * TCGplayer; code cards and accessories are dropped.
 */
export function catalogRows(
  category: { id: number; game: string; language: string },
  group: { groupId: number; name: string; abbreviation?: string | null },
  products: TcgProduct[],
  prices: TcgPrice[],
): CatalogRow[] {
  const byProduct = new Map<number, TcgPrice[]>();
  for (const p of prices) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p]);
  const rows: CatalogRow[] = [];
  for (const p of products) {
    const number = ext(p, 'Number');
    const rarity = ext(p, 'Rarity');
    const sealed = !number && !rarity ? sealedType(p.name) : null;
    if (!number && !sealed) continue;
    rows.push({
      product_id: p.productId,
      category_id: category.id,
      group_id: group.groupId,
      game: category.game,
      language: category.language,
      name: p.name.trim(),
      number,
      rarity,
      set_name: group.name,
      set_code: group.abbreviation?.trim() || null,
      image_url: `https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_400w.jpg`,
      ...primaryPrice(byProduct.get(p.productId) ?? []),
      printings: sealed ? [] : printings(byProduct.get(p.productId) ?? []),
      sealed_type: sealed,
    });
  }
  return rows;
}

/** A price_daily-style row (see comps-math.ts). */
export type Daily = { day: string; market_cents: number; low_cents: number; high_cents: number; sales_30d: number };

/** The app's CardPrice shape (src/services/comps.ts): latest numbers plus up to 90 days of market. */
export type Summary = {
  marketCents: number;
  lowCents: number;
  highCents: number;
  sales30d: number;
  asOf: string;
  series90: number[];
  /** Real data points behind series90 (days with a sale or a TCGplayer price; the rest are
   *  carried forward). Missing on answers cached before 2026-11-06. */
  points?: number;
  /** First and last real data point in the window. */
  since?: string;
  lastReal?: string;
};

/**
 * A Summary from the catalog's own nightly TCGplayer prices (catalog.market_hist, up to 31 nights,
 * newest last). No paid API: this is what sealed product and non-Pokémon cards chart from. The
 * nights are taken as consecutive days ending on updated_on. Null without a price.
 */
export function catalogSummary(row: {
  market_cents: number | null;
  low_cents: number | null;
  market_hist?: number[] | null;
  updated_on: string;
}): Summary | null {
  if (row.market_cents == null) return null;
  const hist = (row.market_hist ?? []).filter((v) => v != null && v > 0);
  const series = hist.length ? hist : [row.market_cents];
  series[series.length - 1] = row.market_cents;
  const first = new Date(`${row.updated_on}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (series.length - 1));
  return {
    marketCents: row.market_cents,
    lowCents: row.low_cents ?? row.market_cents,
    highCents: row.market_cents,
    sales30d: 0,
    asOf: row.updated_on,
    series90: series,
    points: series.length,
    since: first.toISOString().slice(0, 10),
    lastReal: row.updated_on,
  };
}

/** Days in the last `days` that have real data, oldest first. */
export function realDays(dates: string[], today: string, days = 90): string[] {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const from = start.toISOString().slice(0, 10);
  return [...new Set(dates.map((d) => d.slice(0, 10)))].filter((d) => d >= from && d <= today).sort();
}

/** Adds points/since/lastReal to a summary. */
export function withPoints(s: Summary | null, days: string[]): Summary | null {
  if (!s) return s;
  return { ...s, points: days.length, since: days[0], lastReal: days[days.length - 1] };
}

export function summarize(rows: Daily[]): Summary | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day)).slice(-90);
  const last = sorted[sorted.length - 1];
  return {
    marketCents: last.market_cents,
    lowCents: last.low_cents,
    highCents: last.high_cents,
    sales30d: last.sales_30d,
    asOf: last.day,
    series90: sorted.map((r) => r.market_cents),
  };
}

/**
 * Grades kept for a searched card, high to low. Keys match PPT's ebay.priceHistory. All ten come
 * from the same 3-credit call, so the low grades cost nothing extra; the app shows 10/9/8 up front
 * and 7 to 1 behind "Lower".
 */
export const SEARCH_GRADES = ['psa10', 'psa9', 'psa8', 'psa7', 'psa6', 'psa5', 'psa4', 'psa3', 'psa2', 'psa1'] as const;

/** A cached answer from before low grades were kept has no psa7 key at all; fetch it again once. */
export function hasAllGrades(payload: { grades?: Record<string, unknown> } | null | undefined): boolean {
  return !!payload?.grades && SEARCH_GRADES.every((g) => g in payload.grades!);
}

/** How long an opened card's prices are reused before PPT is asked again. */
export const CACHE_HOURS = 24;

export function isFresh(fetchedAt: string | null | undefined, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  return now - new Date(fetchedAt).getTime() < CACHE_HOURS * 3_600_000;
}

/** A sealed product that isn't one plain pack: bundles, boxes, blisters, sleeved retail, lots. */
const NOT_ONE_PACK = /art bundle|bundle|sleeved|blister|box|case|display|\blot\b|set of|code|\d+\s*x\b|\bx\s*\d+|pack of|\d+[- ]pack/i;

/**
 * One booster pack's TCGplayer market for a set, so "Pulled it" can rate a sale against what the
 * pack cost. Sealed products have no card number, so this reads them before catalogRows drops
 * them. The plainest name wins ("Surging Sparks Booster Pack" over its art variants), then the
 * cheapest. Null when the set has no priced single pack.
 */
export function packPrice(products: TcgProduct[], prices: TcgPrice[]): { name: string; cents: number } | null {
  const market = new Map<number, number>();
  for (const p of prices) {
    const c = cents(p.marketPrice ?? p.midPrice);
    if (c != null && (!market.has(p.productId) || c < market.get(p.productId)!)) market.set(p.productId, c);
  }
  const packs = products
    .filter((p) => !ext(p, 'Number') && /booster pack/i.test(p.name) && !NOT_ONE_PACK.test(p.name) && market.has(p.productId))
    .map((p) => ({ name: p.name.trim(), cents: market.get(p.productId)! }))
    .sort((a, b) => a.name.length - b.name.length || a.cents - b.cents);
  return packs[0] ?? null;
}
