// loadSales against a stubbed Supabase client: sales first, then sales_daily, missing tables,
// network failures, and the cache.

const mockResults: Record<string, { data: unknown; error: unknown } | (() => never)> = {};
const mockCalls: { table: string; op: string; args: unknown[] }[] = [];
function mockChain(table: string) {
  const c: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'gte', 'order', 'limit'])
    c[op] = (...args: unknown[]) => {
      mockCalls.push({ table, op, args });
      return c;
    };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const r = mockResults[table] ?? { data: [], error: null };
    return (typeof r === 'function' ? Promise.reject(new TypeError('Network request failed')) : Promise.resolve(r)).then(res, rej);
  };
  return c;
}

jest.mock('../supabase', () => ({ supabase: { from: (t: string) => mockChain(t) } }));

import cards from '../../mocks/cards.json';
import { useSalesCache } from '../../store/sales';
import type { Card } from '../../types';
import { SalesOffline, cachedSales, loadSales } from '../sales';

const mew = (cards as Card[])[0];
const NOW = Date.parse('2026-11-06T12:00:00Z');

beforeEach(() => {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  mockCalls.length = 0;
  useSalesCache.setState({ byKey: {} });
});

it('reads individual sales first, newest first, from the window start', async () => {
  mockResults.sales = {
    data: [{ source: 'ebay', listing_id: 'a', sold_day: '2026-11-05', sold_at: null, price_cents: 102000, kind: 'auction', url: 'https://e/a' }],
    error: null,
  };
  const r = await loadSales(mew, 30, NOW);
  expect(r).toEqual({
    kind: 'sales',
    rows: [{ source: 'ebay', listingId: 'a', soldDay: '2026-11-05', soldAt: null, priceCents: 102000, kind: 'auction', url: 'https://e/a' }],
  });
  expect(mockCalls).toContainEqual({ table: 'sales', op: 'eq', args: ['card_key', 'psa:10:SV2a:205:ja'] });
  expect(mockCalls).toContainEqual({ table: 'sales', op: 'gte', args: ['sold_day', '2026-10-08'] });
  expect(mockCalls.some((c) => c.table === 'sales_daily')).toBe(false);
  expect(cachedSales(mew, 30)?.result).toEqual(r);
  expect(cachedSales(mew, 90)).toBeNull();
});

it('falls back to daily averages when there are no individual sales', async () => {
  mockResults.sales_daily = { data: [{ day: '2026-11-05', sales: 3, avg_cents: 101000 }], error: null };
  expect(await loadSales(mew, 90, NOW)).toEqual({ kind: 'daily', rows: [{ day: '2026-11-05', sales: 3, avgCents: 101000 }] });
  expect(mockCalls).toContainEqual({ table: 'sales_daily', op: 'gte', args: ['day', '2026-08-09'] });
});

it('none when both are empty', async () => {
  expect(await loadSales(mew, 30, NOW)).toEqual({ kind: 'none' });
});

it('a missing table (before 0008) reads as none', async () => {
  mockResults.sales = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };
  expect(await loadSales(mew, 30, NOW)).toEqual({ kind: 'none' });
});

it('a network failure throws and keeps the cache', async () => {
  useSalesCache.getState().put('psa:10:SV2a:205:ja|30', { result: { kind: 'none' }, fetchedAt: '2026-11-05T10:00:00Z' });
  mockResults.sales = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
  await expect(loadSales(mew, 30, NOW)).rejects.toBeInstanceOf(SalesOffline);
  mockResults.sales = () => {
    throw new Error();
  };
  await expect(loadSales(mew, 30, NOW)).rejects.toBeInstanceOf(SalesOffline);
  expect(cachedSales(mew, 30)?.fetchedAt).toBe('2026-11-05T10:00:00Z');
});
