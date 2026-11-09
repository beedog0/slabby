// The Wishlist page's numbers. Pure: wishlist items in, sections and totals out.

import type { WishItem } from '../store/wishlist';

export type WishView = {
  /** Market at or under your price: worth buying now. Biggest gap first. */
  below: WishItem[];
  /** Everything else, newest first (the store's order). */
  watching: WishItem[];
  count: number;
  /** What the whole list costs at your prices. */
  totalCents: number;
};

/** How far market sits under your price, in cents; null when it isn't under or isn't known. */
export function underBy(w: WishItem): number | null {
  if (w.marketCents == null || w.marketCents > w.targetCents) return null;
  return w.targetCents - w.marketCents;
}

export function wishView(items: WishItem[]): WishView {
  const below = items.filter((w) => underBy(w) != null).sort((a, b) => underBy(b)! - underBy(a)!);
  const watching = items.filter((w) => underBy(w) == null);
  return { below, watching, count: items.length, totalCents: items.reduce((t, w) => t + w.targetCents, 0) };
}

/** Move over the last `days` of a daily price series (oldest first), or null when too short. */
export function seriesChange(series: number[] | null | undefined, days = 7): number | null {
  if (!series || series.length <= days) return null;
  const from = series[series.length - 1 - days];
  const to = series[series.length - 1];
  return from > 0 ? to / from - 1 : null;
}
