// Price comps. Screens read the materialized daily rows (price_daily), never raw sales.
// With Supabase configured, `refreshPrices` loads 90 days per card_key into the price store;
// without it, mocks are used. `priceFor` is synchronous so lists render instantly from cache.

import pricesJson from '../mocks/prices.json';
import { cardKey } from '../pricing/cardKey';
import { usePrices } from '../store/prices';
import type { Card } from '../types';
import { supabase } from './supabase';

export type CardPrice = {
  marketCents: number;
  /** 10th percentile of sold, 30 days. Feeds the floor rule. */
  lowCents: number;
  /** 90th percentile of sold, 30 days. */
  highCents: number;
  sales30d: number;
  asOf: string;
  /** Daily market, oldest first, up to 90 points. */
  series90: number[];
};

const mock = pricesJson as Record<string, CardPrice>;

export function priceFor(card: Card): CardPrice | null {
  const key = cardKey(card);
  if (!supabase) return mock[key] ?? null;
  return usePrices.getState().byKey[key] ?? null;
}

type DailyRow = { card_key: string; day: string; market_cents: number; low_cents: number; high_cents: number; sales_30d: number };

/** Build a CardPrice from price_daily rows (any order). Null when there are none. */
export function fromDaily(rows: DailyRow[]): CardPrice | null {
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

/** Load the last 90 days of price_daily for these cards into the price store. */
export async function refreshPrices(cards: Card[]): Promise<void> {
  if (!supabase || !cards.length) return;
  const keys = [...new Set(cards.map(cardKey))];
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('price_daily')
    .select('card_key, day, market_cents, low_cents, high_cents, sales_30d')
    .in('card_key', keys)
    .gte('day', since)
    .limit(keys.length * 90);
  if (error || !data) return;
  const grouped = new Map<string, DailyRow[]>();
  for (const r of data as DailyRow[]) grouped.set(r.card_key, [...(grouped.get(r.card_key) ?? []), r]);
  const next: Record<string, CardPrice> = {};
  for (const [k, rows] of grouped) {
    const p = fromDaily(rows);
    if (p) next[k] = p;
  }
  usePrices.getState().merge(next);
}

/** Ask the server to match a newly added card to its price source (and photo). Fire and forget. */
export async function matchNewCard(card: Card): Promise<void> {
  if (!supabase) return;
  await supabase.functions.invoke('card-match', {
    body: { cardKey: cardKey(card), name: card.name, number: card.number, language: card.language, setName: card.setName },
  });
}

/** Change over the last `days` days of the series, as a fraction. */
export function changeOver(p: CardPrice, days: number): number {
  const s = p.series90;
  if (s.length < 2) return 0;
  const from = s[Math.max(0, s.length - 1 - days)];
  return from ? (s[s.length - 1] - from) / from : 0;
}

/** Market value of the card `days` ago, from the series. */
export function valueAgo(p: CardPrice, days: number): number {
  const s = p.series90;
  return s[Math.max(0, s.length - 1 - days)] ?? p.marketCents;
}
