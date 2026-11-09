// Numbers about the collection for the Profile tab. Pure: rows in (rowFor), numbers out.

import { filterStats, type CardRow } from './portfolio';

export type ProfileStats = {
  /** Market value of everything owned, and how it moved over 30 days. */
  valueCents: number;
  monthDeltaCents: number;
  owned: number;
  graded: number;
  raw: number;
  /** Owned cards with a price paid: their market minus what you paid. */
  gainCents: number;
  paidCents: number;
  /** The owned card worth the most, and the one up the most on what you paid. */
  top: CardRow | null;
  bestBuy: { row: CardRow; gainCents: number } | null;
  /** Owned graded cards by grade, highest first: [10, 4], [9, 2], … */
  grades: [number, number][];
  /** Distinct sets among owned cards. */
  sets: number;
  /** Cards added in the last 30 days. */
  addedMonth: number;
  sold: number;
  soldCents: number;
  /** Sale minus paid, where paid is known. */
  profitCents: number;
};

const DAY = 86_400_000;

export function profileStats(rows: CardRow[], now = new Date()): ProfileStats {
  const owned = rows.filter((r) => r.card.status === 'owned');
  const sold = rows.filter((r) => r.card.status === 'sold');
  const o = filterStats(owned);
  const s = filterStats(sold);

  let gainCents = 0, paidCents = 0, graded = 0, addedMonth = 0;
  let top: CardRow | null = null;
  let bestBuy: ProfileStats['bestBuy'] = null;
  const grades = new Map<number, number>();
  const sets = new Set<string>();
  const since = now.getTime() - 30 * DAY;

  for (const r of owned) {
    const c = r.card;
    const market = r.price?.marketCents ?? null;
    if (c.grader !== 'raw') {
      graded++;
      if (c.grade != null) grades.set(c.grade, (grades.get(c.grade) ?? 0) + 1);
    }
    if (c.setName) sets.add(c.setName.trim().toLowerCase());
    if (Date.parse(c.createdAt) >= since) addedMonth++;
    if (market != null && (!top || market > (top.price?.marketCents ?? 0))) top = r;
    if (market != null && c.paidCents != null) {
      gainCents += market - c.paidCents;
      paidCents += c.paidCents;
      const g = market - c.paidCents;
      if (g > 0 && (!bestBuy || g > bestBuy.gainCents)) bestBuy = { row: r, gainCents: g };
    }
  }

  return {
    valueCents: o.totalCents,
    monthDeltaCents: o.monthDeltaCents,
    owned: owned.length,
    graded,
    raw: owned.length - graded,
    gainCents,
    paidCents,
    top,
    bestBuy,
    grades: [...grades.entries()].sort((a, b) => b[0] - a[0]),
    sets: sets.size,
    addedMonth,
    sold: sold.length,
    soldCents: s.totalCents,
    profitCents: s.profitCents,
  };
}

/** Owned rows by market value, highest first: the showcase. */
export function showcase(rows: CardRow[], n = 7): CardRow[] {
  return rows
    .filter((r) => r.card.status === 'owned' && r.price)
    .sort((a, b) => (b.price!.marketCents ?? 0) - (a.price!.marketCents ?? 0))
    .slice(0, n);
}
