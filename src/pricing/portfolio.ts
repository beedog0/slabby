// Derived numbers for lists and summaries. Pure; screens call these instead of doing math.

import { changeOver, priceFor, valueAgo, type CardPrice } from '../services/comps';
import type { Card, PricingRules } from '../types';
import { quote, type FloorBasis, type Inputs } from './rules';

export function inputsFor(card: Card, price: CardPrice, rules: PricingRules): Inputs {
  return {
    marketCents: price.marketCents,
    low30Cents: price.lowCents,
    paidCents: card.paidCents,
    rules,
    overrides: { ask: card.askOverrideCents, floor: card.floorOverrideCents },
  };
}

export type CardRow = {
  card: Card;
  price: CardPrice | null;
  /** Market vs paid, as a fraction. Null when either is unknown. */
  gain: number | null;
  /** 30-day trend, as a fraction. */
  trend30: number;
  ask: number | null;
  floor: number | null;
  /** Why the floor is what it is. Null without comps. */
  floorBasis: FloorBasis | null;
  buyTarget: number | null;
  buyMax: number | null;
};

export function rowFor(card: Card, rules: PricingRules, price = priceFor(card)): CardRow {
  if (!price) {
    return { card, price, gain: null, trend30: 0, ask: null, floor: null, floorBasis: null, buyTarget: null, buyMax: null };
  }
  const q = quote(inputsFor(card, price, rules));
  const gain = card.paidCents ? (price.marketCents - card.paidCents) / card.paidCents : null;
  return { card, price, gain, trend30: changeOver(price, 30), ...q };
}

export type VaultSummary = {
  valueCents: number;
  /** Change in market value of owned cards over the last 30 days. */
  monthDeltaCents: number;
  forSaleCount: number;
  /** Sum of floors for cards marked to sell. */
  floorTotalCents: number;
};

export function summarize(rows: CardRow[]): VaultSummary {
  let valueCents = 0, monthDeltaCents = 0, forSaleCount = 0, floorTotalCents = 0;
  for (const r of rows) {
    if (r.card.status !== 'owned' || !r.price) continue;
    valueCents += r.price.marketCents;
    monthDeltaCents += r.price.marketCents - valueAgo(r.price, 30);
    if (r.card.plan === 'sell') {
      forSaleCount++;
      floorTotalCents += r.floor ?? 0;
    }
  }
  return { valueCents, monthDeltaCents, forSaleCount, floorTotalCents };
}

export type ConSummary = {
  soldCents: number;
  soldCount: number;
  /** Cards for sale plus cards sold this session: the "of 14". */
  totalCount: number;
  floorTotalCents: number;
};

/** Con mode header numbers. Sold = sold since the session started. */
export function conSummary(rows: CardRow[], startedAt: string): ConSummary {
  let soldCents = 0, soldCount = 0, forSale = 0, floorTotalCents = 0;
  for (const r of rows) {
    const c = r.card;
    if (c.status === 'sold' && c.soldAt && c.soldAt >= startedAt) {
      soldCents += c.soldCents ?? 0;
      soldCount++;
    } else if (c.status === 'owned' && c.plan === 'sell') {
      forSale++;
      floorTotalCents += r.floor ?? 0;
    }
  }
  return { soldCents, soldCount, totalCount: forSale + soldCount, floorTotalCents };
}

export type DetailNumbers = {
  /** Market minus paid. Null when paid is unknown. */
  gainCents: number | null;
  /** Change over the chosen window, as a fraction. */
  change: number;
  /** Daily market for the window, oldest first. */
  series: number[];
};

/** Slab detail numbers for a 30- or 90-day window. Null without comps. */
export function detailFor(row: CardRow, days: 30 | 90): DetailNumbers | null {
  const p = row.price;
  if (!p) return null;
  return {
    gainCents: row.card.paidCents != null ? p.marketCents - row.card.paidCents : null,
    change: changeOver(p, days),
    series: p.series90.slice(-(days + 1)),
  };
}

export type CollectionFilter = 'all' | 'hold' | 'sell' | 'sold';

/** Collection list: filter, sort by value (sold cards by sale date), and total. */
export function collection(rows: CardRow[], filter: CollectionFilter): { rows: CardRow[]; totalCents: number } {
  const keep = rows.filter((r) => {
    const c = r.card;
    if (filter === 'sold') return c.status === 'sold';
    if (c.status !== 'owned') return false;
    if (filter === 'hold') return c.plan === 'hold';
    if (filter === 'sell') return c.plan === 'sell' || c.plan === 'trade';
    return true;
  });
  const value = (r: CardRow) => (r.card.status === 'sold' ? r.card.soldCents ?? 0 : r.price?.marketCents ?? 0);
  const sorted =
    filter === 'sold'
      ? [...keep].sort((a, b) => (b.card.soldAt ?? '').localeCompare(a.card.soldAt ?? ''))
      : [...keep].sort((a, b) => value(b) - value(a));
  return { rows: sorted, totalCents: sorted.reduce((s, r) => s + value(r), 0) };
}

/**
 * Up, down or flat across a series (first point to last). Drives green/red on prices and lines.
 * Moves within ±`threshold` (a fraction of the first point) read as flat.
 */
export function trendOf(series: number[], threshold = 0): 'up' | 'down' | 'flat' {
  if (series.length < 2) return 'flat';
  const first = series[0];
  const d = series[series.length - 1] - first;
  const limit = Math.abs(first) * threshold;
  return d > limit ? 'up' : d < -limit ? 'down' : 'flat';
}

/**
 * Daily value of the owned cards over the last `days` days, oldest first: each card's market
 * series summed by day, aligned on today. A card with a shorter history counts at its first
 * known value before that, so new comps don't read as a jump in the collection.
 */
export function collectionSeries(rows: CardRow[], days = 30): number[] {
  const series = rows
    .filter((r) => r.card.status === 'owned' && r.price && r.price.series90.length)
    .map((r) => r.price!.series90.slice(-(days + 1)));
  if (!series.length) return [];
  const n = Math.max(...series.map((s) => s.length));
  return Array.from({ length: n }, (_, i) =>
    series.reduce((sum, s) => {
      const j = i - (n - s.length);
      return sum + (j >= 0 ? s[j] : s[0]);
    }, 0),
  );
}

export type FilterStats = {
  /** Market value of the filtered owned cards, or sale total for Sold. */
  totalCents: number;
  count: number;
  /** All / Holds: 30-day change in market value. */
  monthDeltaCents: number;
  /** For sale: sum of floors. */
  floorTotalCents: number;
  /** Sold: sale price minus paid, for sold cards with a known paid price. */
  profitCents: number;
};

/** Header numbers for one collection filter, so every filter fills the same lines. */
export function filterStats(rows: CardRow[]): FilterStats {
  let totalCents = 0, monthDeltaCents = 0, floorTotalCents = 0, profitCents = 0;
  for (const r of rows) {
    const c = r.card;
    if (c.status === 'sold') {
      totalCents += c.soldCents ?? 0;
      if (c.soldCents != null && c.paidCents != null) profitCents += c.soldCents - c.paidCents;
      continue;
    }
    if (!r.price) continue;
    totalCents += r.price.marketCents;
    monthDeltaCents += r.price.marketCents - valueAgo(r.price, 30);
    floorTotalCents += r.floor ?? 0;
  }
  return { totalCents, count: rows.length, monthDeltaCents, floorTotalCents, profitCents };
}

/** Running total of sale prices per day over the last `days` days, oldest first. */
export function soldSeries(rows: CardRow[], days = 30, now = new Date()): number[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - days * 86_400_000;
  const out = new Array<number>(days + 1).fill(0);
  let before = 0;
  for (const r of rows) {
    const c = r.card;
    if (c.status !== 'sold' || !c.soldAt || c.soldCents == null) continue;
    const t = Date.parse(c.soldAt.slice(0, 10));
    if (Number.isNaN(t) || t > end) continue;
    if (t < start) before += c.soldCents;
    else out[Math.round((t - start) / 86_400_000)] += c.soldCents;
  }
  let run = before;
  return out.map((v) => (run += v));
}
