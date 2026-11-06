// Recent sales for the sales screen (0008_recent_sales.sql). Individual listings (`sales`) when
// the server has them, else daily averages (`sales_daily`). Without Supabase, mocks. A table
// that isn't there yet reads as no sales; a network failure throws SalesOffline so the screen
// can keep showing the cached answer.

import salesJson from '../mocks/sales.json';
import { cardKey } from '../pricing/cardKey';
import { useSalesCache, type CachedSales } from '../store/sales';
import type { Card, SalesResult } from '../types';
import { supabase } from './supabase';

export type SalesDays = 30 | 90;

export class SalesOffline extends Error {
  constructor() {
    super('sales_offline');
  }
}

const DAY = 86_400_000;
const mocks = salesJson as unknown as Record<string, SalesResult>;

const cacheKey = (key: string, days: SalesDays) => `${key}|${days}`;

function dayMinus(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Mocks are a fixed snapshot, so their window ends on their newest day, not today. */
export function mockSales(key: string, days: SalesDays): SalesResult {
  const m = mocks[key];
  if (!m || m.kind === 'none') return { kind: 'none' };
  if (m.kind === 'sales') {
    const since = dayMinus(m.rows[0]?.soldDay ?? '1970-01-01', days - 1);
    const rows = m.rows.filter((r) => r.soldDay >= since);
    return rows.length ? { kind: 'sales', rows } : { kind: 'none' };
  }
  const since = dayMinus(m.rows[0]?.day ?? '1970-01-01', days - 1);
  const rows = m.rows.filter((r) => r.day >= since);
  return rows.length ? { kind: 'daily', rows } : { kind: 'none' };
}

/** The last answer for this card and window, if any. */
export function cachedSales(card: Card, days: SalesDays): CachedSales | null {
  return useSalesCache.getState().byKey[cacheKey(cardKey(card), days)] ?? null;
}

type PgError = { code?: string; message?: string } | null;
type SaleRowDb = { source: string; listing_id: string; sold_day: string; sold_at: string | null; price_cents: number; kind: string | null; url: string | null };
type DayRowDb = { day: string; sales: number; avg_cents: number };

/** A PostgREST/Postgres error carries a code (missing table: PGRST205, 42P01); a dropped fetch doesn't. */
function check(error: PgError): 'ok' | 'missing' {
  if (!error) return 'ok';
  if (error.code) return 'missing';
  throw new SalesOffline();
}

const KINDS = new Set(['auction', 'bin', 'offer']);

/** Newest first. Writes the answer to the cache (not for mocks). */
export async function loadSales(card: Card, days: SalesDays, now = Date.now()): Promise<SalesResult> {
  const key = cardKey(card);
  if (!supabase) return mockSales(key, days);
  const since = new Date(now - (days - 1) * DAY).toISOString().slice(0, 10);
  let result: SalesResult;
  try {
    const sales = await supabase
      .from('sales')
      .select('source, listing_id, sold_day, sold_at, price_cents, kind, url')
      .eq('card_key', key)
      .gte('sold_day', since)
      .order('sold_day', { ascending: false })
      .order('sold_at', { ascending: false, nullsFirst: false })
      .limit(300);
    if (check(sales.error) === 'missing') result = { kind: 'none' };
    else if (sales.data?.length) {
      result = {
        kind: 'sales',
        rows: (sales.data as SaleRowDb[]).map((r) => ({
          source: r.source,
          listingId: r.listing_id,
          soldDay: r.sold_day,
          soldAt: r.sold_at,
          priceCents: r.price_cents,
          kind: r.kind && KINDS.has(r.kind) ? (r.kind as 'auction' | 'bin' | 'offer') : null,
          url: r.url,
        })),
      };
    } else {
      const daily = await supabase
        .from('sales_daily')
        .select('day, sales, avg_cents')
        .eq('card_key', key)
        .gte('day', since)
        .order('day', { ascending: false })
        .limit(days + 1);
      if (check(daily.error) === 'missing' || !daily.data?.length) result = { kind: 'none' };
      else result = { kind: 'daily', rows: (daily.data as DayRowDb[]).map((r) => ({ day: r.day, sales: r.sales, avgCents: r.avg_cents })) };
    }
  } catch (e) {
    if (e instanceof SalesOffline) throw e;
    throw new SalesOffline();
  }
  useSalesCache.getState().put(cacheKey(key, days), { result, fetchedAt: new Date(now).toISOString() });
  return result;
}
