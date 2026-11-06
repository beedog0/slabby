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
};

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
 * Catalog rows for one set. Only singles are kept: sealed product (booster boxes, ETBs, code
 * cards) has no card number on TCGplayer.
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
    if (!number) continue;
    rows.push({
      product_id: p.productId,
      category_id: category.id,
      group_id: group.groupId,
      game: category.game,
      language: category.language,
      name: p.name.trim(),
      number,
      rarity: ext(p, 'Rarity'),
      set_name: group.name,
      set_code: group.abbreviation?.trim() || null,
      image_url: `https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_400w.jpg`,
      ...primaryPrice(byProduct.get(p.productId) ?? []),
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
