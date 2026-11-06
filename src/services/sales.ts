// Recent sales for the sales screen (0008_recent_sales.sql). Individual listings (`sales`) when
// the server has them, else daily averages (`sales_daily`). Without Supabase, mocks. A table
// that isn't there yet reads as no sales; any other failure throws SalesOffline and leaves the
// cache alone so the screen keeps showing the last answer.

import salesJson from '../mocks/sales.json';
import { cardKey } from '../pricing/cardKey';
import { useSalesCache, validEntry, type CachedSales } from '../store/sales';
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

/** The last answer for this card and window, if any (a malformed persisted entry reads as none). */
export function cachedSales(card: Card, days: SalesDays): CachedSales | null {
  const entry = useSalesCache.getState().byKey?.[cacheKey(cardKey(card), days)];
  return validEntry(entry) ? entry : null;
}

type PgResponse = { data: unknown; error: { code?: string; message?: string } | null; status?: number };
type SaleRowDb = { source: string; listing_id: string; sold_day: string; sold_at: string | null; price_cents: number; kind: string | null; url: string | null };
type DayRowDb = { day: string; sales: number; avg_cents: number };

/** Postgres/PostgREST codes for a table that isn't deployed yet (before 0008). */
const MISSING = new Set(['PGRST205', '42P01']);

/**
 * 'missing' only for a table that isn't there (PGRST205, 42P01, or a 404 with no body). Anything
 * else (expired JWT, RLS, timeout, schema cache, 5xx, a gateway page, a dropped fetch) throws
 * SalesOffline so the cache stays as it was.
 */
function check(res: PgResponse): 'ok' | 'missing' {
  const { error } = res;
  if (!error) return 'ok';
  if (error.code && MISSING.has(error.code)) return 'missing';
  if (res.status === 404 && !error.code && !error.message) return 'missing';
  throw new SalesOffline();
}

/**
 * Each query tries once (no supabase-js backoff retries) and gives up after this long, so no
 * signal reads as offline in seconds. A pull to refresh is the retry.
 */
export const SALES_TIMEOUT_MS = 5000;

function timeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

const KINDS = new Set(['auction', 'bin', 'offer']);

/** Newest first. Writes the answer to the cache (not for mocks). Raw cards have no sold comps. */
export async function loadSales(card: Card, days: SalesDays, now = Date.now()): Promise<SalesResult> {
  if (card.grader === 'raw') return { kind: 'none' };
  const key = cardKey(card);
  if (!supabase) return mockSales(key, days);
  const db = supabase;
  const since = new Date(now - (days - 1) * DAY).toISOString().slice(0, 10);
  const t = timeout(SALES_TIMEOUT_MS);
  let result: SalesResult;
  try {
    const sales: PgResponse = await db
      .from('sales')
      .select('source, listing_id, sold_day, sold_at, price_cents, kind, url')
      .eq('card_key', key)
      .gte('sold_day', since)
      .order('sold_day', { ascending: false })
      .order('sold_at', { ascending: false, nullsFirst: false })
      .limit(300)
      .retry(false)
      .abortSignal(t.signal);
    const salesRows = check(sales) === 'ok' && Array.isArray(sales.data) ? (sales.data as SaleRowDb[]) : [];
    if (salesRows.length) {
      result = {
        kind: 'sales',
        rows: salesRows.map((r) => ({
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
      // No listings (or no sales table yet): daily averages, judged on sales_daily's own answer.
      const daily: PgResponse = await db
        .from('sales_daily')
        .select('day, sales, avg_cents')
        .eq('card_key', key)
        .gte('day', since)
        .order('day', { ascending: false })
        .limit(days + 1)
        .retry(false)
        .abortSignal(t.signal);
      const dayRows = check(daily) === 'ok' && Array.isArray(daily.data) ? (daily.data as DayRowDb[]) : [];
      result = dayRows.length
        ? { kind: 'daily', rows: dayRows.map((r) => ({ day: r.day, sales: r.sales, avgCents: r.avg_cents })) }
        : { kind: 'none' };
    }
  } catch {
    throw new SalesOffline();
  } finally {
    t.clear();
  }
  useSalesCache.getState().put(cacheKey(key, days), { result, fetchedAt: new Date(now).toISOString() });
  return result;
}
