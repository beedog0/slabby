// What you'd bring to the table, for the Con tab before con mode starts. Pure.

import type { CardRow } from './portfolio';

export type TableReady = {
  /** For sale, priciest ask first. */
  forSale: CardRow[];
  askCents: number;
  floorCents: number;
  tradeOnly: number;
};

export function tableReady(rows: CardRow[]): TableReady {
  const owned = rows.filter((r) => r.card.status === 'owned');
  const forSale = owned.filter((r) => r.card.plan === 'sell').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0));
  return {
    forSale,
    askCents: forSale.reduce((t, r) => t + (r.ask ?? 0), 0),
    floorCents: forSale.reduce((t, r) => t + (r.floor ?? 0), 0),
    tradeOnly: owned.filter((r) => r.card.plan === 'trade').length,
  };
}

export type SalesDay = {
  /** YYYY-MM-DD of the most recent day anything sold. */
  day: string;
  count: number;
  soldCents: number;
  /** Sale minus paid where paid is known. */
  profitCents: number;
};

/** The last day you sold anything: what con mode's summary would have said that day. */
export function lastSalesDay(rows: CardRow[]): SalesDay | null {
  const sold = rows.filter((r) => r.card.status === 'sold' && r.card.soldAt);
  if (!sold.length) return null;
  const day = sold.map((r) => r.card.soldAt!.slice(0, 10)).sort().pop()!;
  const that = sold.filter((r) => r.card.soldAt!.slice(0, 10) === day);
  let soldCents = 0, profitCents = 0;
  for (const r of that) {
    soldCents += r.card.soldCents ?? 0;
    if (r.card.soldCents != null && r.card.paidCents != null) profitCents += r.card.soldCents - r.card.paidCents;
  }
  return { day, count: that.length, soldCents, profitCents };
}

/** Sold cards, newest sale first. */
export function recentSales(rows: CardRow[], n = 5): CardRow[] {
  return rows
    .filter((r) => r.card.status === 'sold' && r.card.soldAt)
    .sort((a, b) => b.card.soldAt!.localeCompare(a.card.soldAt!))
    .slice(0, n);
}

/** Cards you bought (a price paid and a day), newest first. */
export function recentBuys(rows: CardRow[], n = 5): CardRow[] {
  return rows
    // A buy is money changing hands: bought in con mode, or a paid price above $0. Pulled from a
    // pack or gifted ($0, or no price) is not a buy.
    .filter((r) => (r.card.boughtConId || (r.card.paidCents ?? 0) > 0) && (r.card.paidAt || r.card.createdAt))
    .sort((a, b) => (b.card.paidAt ?? b.card.createdAt).localeCompare(a.card.paidAt ?? a.card.createdAt))
    .slice(0, n);
}
