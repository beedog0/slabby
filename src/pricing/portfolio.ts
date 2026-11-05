// Derived numbers for lists and summaries. Pure; screens call these instead of doing math.

import { changeOver, priceFor, valueAgo, type CardPrice } from '../services/comps';
import type { Card, PricingRules } from '../types';
import { quote, type Inputs } from './rules';

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
  buyTarget: number | null;
  buyMax: number | null;
};

export function rowFor(card: Card, rules: PricingRules, price = priceFor(card)): CardRow {
  if (!price) {
    return { card, price, gain: null, trend30: 0, ask: null, floor: null, buyTarget: null, buyMax: null };
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
