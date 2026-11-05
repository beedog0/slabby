// Price comps. Screens read the materialized daily rows (price_daily), never raw sales.
// With Supabase configured, `refreshPrices` loads 90 days per card_key into the price store;
// without it, mocks are used. `priceFor` is synchronous so lists render instantly from cache.

import pricesJson from '../mocks/prices.json';
import { cardKey } from '../pricing/cardKey';
import { usePrices } from '../store/prices';
import { useVault } from '../store/vault';
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
  fillArt(cards).catch(() => {});
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

type CardRef = { card_key: string; tcgplayer_id: string | null; image_url: string | null };

/** The card photo for a matched product: PPT's CDN copy, else TCGplayer's own image server. */
export function artFor(ref: Pick<CardRef, 'tcgplayer_id' | 'image_url'> | null | undefined): string | null {
  if (!ref) return null;
  if (ref.image_url) return ref.image_url;
  return ref.tcgplayer_id ? `https://tcgplayer-cdn.tcgplayer.com/product/${ref.tcgplayer_id}_400w.jpg` : null;
}

/** Put the matched photo on every vault card with this card_key that has none yet. */
function saveArt(key: string, url: string | null) {
  if (!url) return;
  const vault = useVault.getState();
  for (const c of vault.cards) if (!c.imageFrontUrl && cardKey(c) === key) vault.update(c.id, { imageFrontUrl: url });
}

/** Ask the server to match a newly added card to its price source and photo, then save the photo. */
export async function matchNewCard(card: Card): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.functions.invoke<CardRef>('card-match', {
    body: {
      cardKey: cardKey(card),
      name: card.name,
      number: card.number,
      language: card.language,
      setName: card.setName,
      setCode: card.setCode,
    },
  });
  saveArt(cardKey(card), artFor(data));
}

const retried = new Set<string>();

/**
 * Fill in photos for cards that don't have one: from card_refs when the card is already matched,
 * otherwise ask card-match again (once per app run, since a miss costs a search credit).
 */
export async function fillArt(cards: Card[]): Promise<void> {
  if (!supabase) return;
  const missing = cards.filter((c) => !c.imageFrontUrl && c.status === 'owned');
  if (!missing.length) return;
  const keys = [...new Set(missing.map(cardKey))];
  const { data } = await supabase.from('card_refs').select('card_key, tcgplayer_id, image_url').in('card_key', keys);
  const refs = new Map((data as CardRef[] | null)?.map((r) => [r.card_key, r]) ?? []);
  for (const key of keys) {
    const art = artFor(refs.get(key));
    if (art) saveArt(key, art);
    else if (!retried.has(key)) {
      retried.add(key);
      const card = missing.find((c) => cardKey(c) === key)!;
      await matchNewCard(card).catch(() => {});
    }
  }
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
