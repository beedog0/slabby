// Price comps. Screens read the materialized daily rows (price_daily), never raw sales.
// With Supabase configured, `refreshPrices` loads 90 days per card_key into the price store;
// without it, mocks are used. `priceFor` is synchronous so lists render instantly from cache.

import catalogJson from '../mocks/catalog.json';
import { LOOKBACK_DAYS, withHeadline, type Basis, type SaleDay } from '../pricing/lastSales';
import pricesJson from '../mocks/prices.json';
import { catalogSummary } from '../../supabase/functions/_shared/catalog-math';
import { cardKey } from '../pricing/cardKey';
import { fallbackPrice } from '../pricing/estimate';
import { useEstimates } from '../store/estimates';
import type { Estimate } from '../../supabase/functions/_shared/estimate-math';
import { nameFromMatch } from './psa';
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
  // Freshness (0007). Optional so prices persisted before it still load; null = known missing.
  /** When the server last wrote comps for this card (ISO time). */
  refreshedAt?: string | null;
  /** Latest day with a sale (graded) or a market point (raw), "YYYY-MM-DD". */
  lastSaleDay?: string | null;
  /** Sales over 90 days: sales_30d on the last day, 30 and 60 days before it. */
  sales90d?: number;
  /**
   * Set only on a card with no price source: 'estimate' = the AI search of sold listings
   * ("Find a price"), 'own' = the price you typed. Never a comp; screens label it.
   */
  source?: 'estimate' | 'own';
  /** The estimate and its sales, when there is one (also under your own price). */
  estimate?: Estimate;
  /** Search card page only (card-prices v2): up to 180 days of daily market, one value per day from histFrom. */
  histFrom?: string;
  hist?: number[];
  /** Search card page only: the latest day with a graded sale, its average and how many sold. */
  lastSale?: { day: string; cents: number; count: number } | null;
  // Headline (src/pricing/lastSales.ts). Graded only; missing on answers without sale days.
  /** Every day with a sale in the server's history (card-prices v3), any order. */
  saleDays?: SaleDay[];
  /** How marketCents was set: median of the last 5 sales, or the last sale when there are fewer. */
  basis?: Basis;
  /** The sales behind the headline, newest first, one line per day. */
  recent?: SaleDay[];
  /** The rolling 30-day median before the headline replaced it. */
  median30Cents?: number;
};

const mock = pricesJson as Record<string, CardPrice>;

export function priceFor(card: Card): CardPrice | null {
  const key = cardKey(card);
  const real = !supabase ? (card.sealed ? mockSealed(card) : mock[key]) : usePrices.getState().byKey[key];
  if (real) return real;
  const { ownByKey, byKey } = useEstimates.getState();
  return fallbackPrice(ownByKey[key], byKey[key]);
}

type DailyRow = { card_key: string; day: string; market_cents: number; low_cents: number; high_cents: number; sales_30d: number };

/** Build a CardPrice from price_daily rows (any order). Null when there are none. */
export function fromDaily(rows: DailyRow[]): CardPrice | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day)).slice(-90);
  const last = sorted[sorted.length - 1];
  const byDay = new Map(sorted.map((r) => [r.day, r.sales_30d]));
  const sales90d = [0, 30, 60].reduce((sum, back) => sum + (byDay.get(dayBefore(last.day, back)) ?? 0), 0);
  return {
    marketCents: last.market_cents,
    lowCents: last.low_cents,
    highCents: last.high_cents,
    sales30d: last.sales_30d,
    asOf: last.day,
    series90: sorted.map((r) => r.market_cents),
    sales90d,
  };
}

function dayBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type Freshness = { card_key: string; comps_refreshed_at: string | null; last_sale_day: string | null };

/** Sealed product in the vault: priced by product id from the catalog (no price_daily rows). */
const isSealedCard = (c: Card) => !!c.sealed && !!c.productId;

type SealedRow = { product_id: number; market_cents: number | null; low_cents: number | null; market_hist: number[] | null; updated_on: string };

/** A sealed item's CardPrice from its catalog row: tonight's TCGplayer market, 31 nights of chart. */
export function sealedPrice(r: SealedRow): CardPrice | null {
  const s = catalogSummary(r);
  if (!s) return null;
  return {
    marketCents: s.marketCents,
    lowCents: s.lowCents,
    highCents: s.highCents,
    sales30d: 0,
    asOf: s.asOf,
    series90: s.series90,
    // Written by tonight's catalog import; the latest market point is its day.
    refreshedAt: `${r.updated_on}T21:00:00Z`,
    lastSaleDay: r.updated_on,
  };
}

/** Load sealed items' prices from the catalog into the price store. */
async function refreshSealed(cards: Card[]): Promise<void> {
  if (!supabase || !cards.length) return;
  const ids = [...new Set(cards.map((c) => c.productId!))];
  const { data, error } = await supabase.from('catalog').select('product_id, market_cents, low_cents, market_hist, updated_on').in('product_id', ids);
  if (error || !data) return;
  const next: Record<string, CardPrice> = {};
  for (const r of data as SealedRow[]) {
    const p = sealedPrice(r);
    if (p) next[`sealed:${r.product_id}`] = p;
  }
  usePrices.getState().merge(next);
}

function mockSealed(card: Card): CardPrice | null {
  const c = (catalogJson as { productId: number; marketCents: number | null }[]).find((m) => m.productId === card.productId);
  if (!c || c.marketCents == null) return null;
  const s = catalogSummary({ market_cents: c.marketCents, low_cents: null, market_hist: [], updated_on: '2026-11-07' })!;
  return { ...s, sales30d: 0 };
}

/** Load the last 90 days of price_daily for these cards into the price store. */
export async function refreshPrices(all: Card[]): Promise<void> {
  if (!supabase || !all.length) return;
  const sealed = all.filter(isSealedCard);
  const cards = all.filter((c) => !isSealedCard(c));
  if (sealed.length) await refreshSealed(sealed).catch(() => {});
  if (!cards.length) return;
  fillArt(cards).catch(() => {});
  const keys = [...new Set(cards.map(cardKey))];
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('price_daily')
    .select('card_key, day, market_cents, low_cents, high_cents, sales_30d')
    .in('card_key', keys)
    .gte('day', since)
    // Newest first, so a limit that bites drops the oldest day, never today's.
    .order('day', { ascending: false })
    .limit(keys.length * 91);
  if (error || !data) return;
  const fresh = await freshnessFor(keys);
  const grouped = new Map<string, DailyRow[]>();
  for (const r of data as DailyRow[]) grouped.set(r.card_key, [...(grouped.get(r.card_key) ?? []), r]);
  const lastSales = await lastSalesFor(keys);
  const today = new Date().toISOString().slice(0, 10);
  const next: Record<string, CardPrice> = {};
  for (const [k, rows] of grouped) {
    const daily = fromDaily(rows);
    if (!daily) continue;
    const f = fresh?.get(k);
    const p = f ? { ...daily, refreshedAt: f.comps_refreshed_at, lastSaleDay: f.last_sale_day } : daily;
    // Graded keys only have sale days; raw keeps TCGplayer market.
    next[k] = lastSales ? withHeadline(p, lastSales.get(k), today) : p;
  }
  usePrices.getState().merge(next);
}

type LastSaleRow = { card_key: string; day: string; sales: number; avg_cents: number };

/**
 * The last 5 sales per card (0027 last_sale_days, 180 days back) for the headline price. Null on
 * any error, including a project without 0027, so prices still load on the rolling median.
 */
async function lastSalesFor(keys: string[]): Promise<Map<string, SaleDay[]> | null> {
  if (!supabase) return null;
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('last_sale_days', { keys, since });
    if (error || !data) return null;
    const out = new Map<string, SaleDay[]>();
    for (const r of data as LastSaleRow[]) out.set(r.card_key, [...(out.get(r.card_key) ?? []), { day: r.day, cents: r.avg_cents, count: r.sales }]);
    return out;
  } catch {
    return null;
  }
}

/**
 * Freshness columns from card_refs, in their own query so a project without 0007 (42703,
 * PGRST204) still gets its prices. Null on any error.
 */
async function freshnessFor(keys: string[]): Promise<Map<string, Freshness> | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('card_refs')
      .select('card_key, comps_refreshed_at, last_sale_day')
      .in('card_key', keys);
    if (error || !data) return null;
    return new Map((data as Freshness[]).map((r) => [r.card_key, r]));
  } catch {
    return null;
  }
}

const SIX_HOURS = 6 * 3_600_000;

/** True when comps were written more than `maxMs` ago, or it isn't known when. */
export function isStale(refreshedAt: string | null | undefined, now = Date.now(), maxMs = SIX_HOURS): boolean {
  if (!refreshedAt) return true;
  const t = Date.parse(refreshedAt);
  return Number.isNaN(t) || now - t > maxMs;
}

export type RefreshStatus = 'refreshed' | 'fresh' | 'failed' | 'skipped';
type RefreshAnswer = { status: 'refreshed' | 'fresh' | 'throttled' | 'no_match' | 'not_owned' | 'error' };
export type RefreshOpts = {
  force?: boolean;
  now?: number;
  /** Forced only: skip when comps were written less than this long ago (con mode: 1 h). */
  minAgeMs?: number;
  /** Called once, right before the server is actually asked (never for a skip). */
  onStart?: () => void;
};

const HOUR = 3_600_000;
/** Set when comps-refresh isn't deployed (404); the app then stops asking for this run. */
let refreshUnavailable = false;
type Running = { promise: Promise<RefreshStatus>; started: boolean; listeners: (() => void)[] };
const inFlight = new Map<string, Running>();
/** When each card_key was last sent to comps-refresh, whatever came of it. */
const lastAttemptAt = new Map<string, number>();

/**
 * Ask the server to refresh one card's comps, then reload its prices. Skipped without Supabase
 * or a session, and (unless forced) while the comps are fresh or the card was tried in the last
 * 6 h. One call per card_key at a time. Never throws. 'failed' = the update didn't happen
 * (offline, server error); 'fresh' = nothing newer to get right now (cooldown, budget spent).
 * A forced refresh with comps-refresh missing still reloads price_daily.
 */
export function refreshCard(card: Card, opts: RefreshOpts = {}): Promise<RefreshStatus> {
  const key = cardKey(card);
  const running = inFlight.get(key);
  if (running) {
    if (opts.onStart) running.started ? opts.onStart() : running.listeners.push(opts.onStart);
    return running.promise;
  }
  const entry: Running = { promise: null as unknown as Promise<RefreshStatus>, started: false, listeners: opts.onStart ? [opts.onStart] : [] };
  const start = () => {
    entry.started = true;
    for (const l of entry.listeners.splice(0)) l();
  };
  entry.promise = runRefresh(card, key, opts, start).finally(() => inFlight.delete(key));
  inFlight.set(key, entry);
  return entry.promise;
}

async function runRefresh(card: Card, key: string, { force = false, now = Date.now(), minAgeMs }: RefreshOpts, start: () => void): Promise<RefreshStatus> {
  if (!supabase) return 'skipped';
  // Sealed prices are the catalog's nightly TCGplayer market: reload it, no comps call.
  if (isSealedCard(card)) {
    start();
    await refreshSealed([card]).catch(() => {});
    return 'refreshed';
  }
  if (refreshUnavailable) {
    if (force) await refreshPrices([card]).catch(() => {});
    return 'skipped';
  }
  const refreshedAt = usePrices.getState().byKey[key]?.refreshedAt;
  if (!force && !isStale(refreshedAt, now)) return 'fresh';
  if (!force && now - (lastAttemptAt.get(key) ?? -Infinity) < SIX_HOURS) return 'skipped';
  if (force && minAgeMs && !isStale(refreshedAt, now, minAgeMs)) return 'fresh';
  try {
    if (!(await supabase.auth.getSession()).data.session) return 'skipped';
    start();
    lastAttemptAt.set(key, now);
    const { data, error } = await supabase.functions.invoke<RefreshAnswer>('comps-refresh', { body: { cardKey: key, force } });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404) {
        refreshUnavailable = true;
        if (force) await refreshPrices([card]).catch(() => {});
        return 'skipped';
      }
      return 'failed';
    }
    await refreshPrices([card]);
    switch (data?.status) {
      case 'refreshed':
        return 'refreshed';
      case 'fresh':
      case 'throttled':
        return 'fresh';
      case 'no_match':
      case 'not_owned':
        return 'skipped';
      default:
        return 'failed';
    }
  } catch {
    return 'failed';
  }
}

/**
 * Refresh several cards, three at a time. Resolves to each card's status, in order. Forced with
 * comps-refresh missing, it reloads their price_daily in one query instead.
 */
export async function refreshCards(cards: Card[], opts: Omit<RefreshOpts, 'onStart'> = {}): Promise<RefreshStatus[]> {
  if (opts.force && supabase && refreshUnavailable) {
    await refreshPrices(cards).catch(() => {});
    return cards.map(() => 'skipped');
  }
  const out: RefreshStatus[] = new Array(cards.length);
  let next = 0;
  const worker = async () => {
    while (next < cards.length) {
      const i = next++;
      out[i] = await refreshCard(cards[i], opts);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

/** Con mode's pull: don't spend a call on cards written in the last hour. */
export const CON_MIN_AGE_MS = HOUR;

/** Whether a refresh can be asked for at all (Supabase configured, comps-refresh deployed). */
export function canRefresh(): boolean {
  return !!supabase && !refreshUnavailable;
}

/** Test hook: forget that comps-refresh was missing, and every attempt. */
export function resetRefreshForTests() {
  refreshUnavailable = false;
  inFlight.clear();
  lastAttemptAt.clear();
}

export type CardRef = { card_key: string; tcgplayer_id: string | null; image_url: string | null; matched_name?: string | null };

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

/** Replace label misreads ("Pza") with the matched card's name on every card with this card_key. */
function saveName(key: string, matched: string | null | undefined) {
  if (!matched) return;
  const vault = useVault.getState();
  for (const c of vault.cards) {
    if (cardKey(c) !== key) continue;
    const name = nameFromMatch(c.name, matched);
    if (name) vault.update(c.id, { name });
  }
}

/** card_keys card-match has answered for this app run. A miss costs a search credit, so ask once. */
const retried = new Set<string>();

/**
 * Ask the server to match a newly scanned or added card to its price source and photo, then save the photo.
 * `tcgPlayerId` comes from card search. Resolves to the server's answer, or null when the call itself failed (signed out, offline).
 */
export async function matchNewCard(card: Card, tcgPlayerId?: string): Promise<CardRef | null> {
  if (!supabase) return null;
  // Sealed product is already its catalog product: photo and price come from there.
  if (isSealedCard(card)) {
    await refreshSealed([card]).catch(() => {});
    return null;
  }
  const { data, error } = await supabase.functions.invoke<CardRef>('card-match', {
    body: {
      cardKey: cardKey(card),
      game: card.game ?? 'pokemon',
      variety: card.variety ?? null,
      name: card.name,
      number: card.number,
      language: card.language,
      setName: card.setName,
      setCode: card.setCode,
      // Added from search: the product is known, so the server skips matching.
      tcgPlayerId,
    },
  });
  if (error || !data) return null;
  retried.add(cardKey(card));
  saveArt(cardKey(card), artFor(data));
  saveName(cardKey(card), data.matched_name);
  return data;
}

/**
 * Fill in photos and names from card_refs: a missing photo, or a name the label misread. When a
 * card has no match yet (or was matched before names were kept), ask card-match again, once per
 * app run, since a miss costs a search credit.
 */
export async function fillArt(cards: Card[]): Promise<void> {
  if (!supabase) return;
  // Before the guest session exists, RLS hides card_refs and card-match answers 401.
  if (!(await supabase.auth.getSession()).data.session) return;
  const owned = cards.filter((c) => c.status === 'owned' && !isSealedCard(c));
  if (!owned.length) return;
  const keys = [...new Set(owned.map(cardKey))];
  const named = await supabase.from('card_refs').select('card_key, tcgplayer_id, image_url, matched_name').in('card_key', keys);
  const error = named.error;
  // A project without 0014 has no matched_name: still fill photos.
  const data: CardRef[] | null = error
    ? (await supabase.from('card_refs').select('card_key, tcgplayer_id, image_url').in('card_key', keys)).data
    : named.data;
  const refs = new Map(data?.map((r) => [r.card_key, r]) ?? []);
  for (const key of keys) {
    const ref = refs.get(key);
    const needsArt = owned.some((c) => cardKey(c) === key && !c.imageFrontUrl);
    saveName(key, ref?.matched_name);
    const art = artFor(ref);
    if (art && needsArt) saveArt(key, art);
    // No row at all: a new card_key (cardKey() now keys set-code-less Pokémon cards by set name),
    // so match it once to get its photo and prices under the new key.
    const ask = !ref || (needsArt && !art) || (!error && !!ref.tcgplayer_id && !ref.matched_name);
    if (ask && !retried.has(key)) {
      const card = owned.find((c) => cardKey(c) === key)!;
      // Only a real answer counts as tried; a failed call is retried on the next refresh.
      const answer = await matchNewCard(card).catch(() => null);
      if (answer) retried.add(key);
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
