// loadSales against a stubbed Supabase client: sales first, then sales_daily, missing tables,
// network failures, and the cache.

const mockResults: Record<string, { data: unknown; error: unknown; status?: number } | (() => never) | 'hang'> = {};
const mockCalls: { table: string; op: string; args: unknown[] }[] = [];
function mockChain(table: string) {
  const c: Record<string, unknown> = {};
  let signal: AbortSignal | undefined;
  for (const op of ['select', 'eq', 'gte', 'order', 'limit', 'retry', 'abortSignal'])
    c[op] = (...args: unknown[]) => {
      mockCalls.push({ table, op, args });
      if (op === 'abortSignal') signal = args[0] as AbortSignal;
      return c;
    };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const r = mockResults[table] ?? { data: [], error: null };
    if (r === 'hang')
      // Like postgrest-js: an aborted request resolves with a code-less error.
      return new Promise((done) => signal?.addEventListener('abort', () => done({ data: null, error: { message: 'AbortError: aborted', code: '' } }))).then(res, rej);
    return (typeof r === 'function' ? Promise.reject(new TypeError('Network request failed')) : Promise.resolve(r)).then(res, rej);
  };
  return c;
}

jest.mock('../supabase', () => ({ supabase: { from: (t: string) => mockChain(t) } }));

import cards from '../../mocks/cards.json';
import { useSalesCache } from '../../store/sales';
import type { Card } from '../../types';
import { SALES_TIMEOUT_MS, SalesOffline, cachedSales, loadSales } from '../sales';

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
  mockResults.sales = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
  mockResults.sales_daily = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
  expect(await loadSales(mew, 30, NOW)).toEqual({ kind: 'none' });
  mockResults.sales = { data: null, error: { message: '' }, status: 404 };
  expect(await loadSales(mew, 30, NOW)).toEqual({ kind: 'none' });
});

it('with no sales table, sales_daily still answers', async () => {
  mockResults.sales = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };
  mockResults.sales_daily = { data: [{ day: '2026-11-05', sales: 2, avg_cents: 99000 }], error: null };
  expect(await loadSales(mew, 30, NOW)).toEqual({ kind: 'daily', rows: [{ day: '2026-11-05', sales: 2, avgCents: 99000 }] });
});

it.each([
  ['JWT expired', { code: 'PGRST301', message: 'JWT expired' }],
  ['JWT invalid', { code: 'PGRST303', message: 'JWT claims invalid' }],
  ['RLS', { code: '42501', message: 'permission denied' }],
  ['statement timeout', { code: '57014', message: 'canceling statement' }],
  ['schema cache', { code: 'PGRST002', message: 'schema cache' }],
  ['gateway page', { message: '<html>Bad Gateway</html>' }],
])('%s throws SalesOffline and keeps a good cache', async (_n, error) => {
  mockResults.sales = { data: [{ source: 'ebay', listing_id: 'a', sold_day: '2026-11-05', sold_at: null, price_cents: 1000, kind: null, url: null }], error: null };
  await loadSales(mew, 30, NOW);
  mockResults.sales = { data: null, error, status: 503 };
  await expect(loadSales(mew, 30, NOW + 1000)).rejects.toBeInstanceOf(SalesOffline);
  expect(cachedSales(mew, 30)?.result.kind).toBe('sales');
  expect(cachedSales(mew, 30)?.fetchedAt).toBe(new Date(NOW).toISOString());
});

it('a sales_daily error other than a missing table throws too', async () => {
  mockResults.sales_daily = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };
  await expect(loadSales(mew, 30, NOW)).rejects.toBeInstanceOf(SalesOffline);
  expect(cachedSales(mew, 30)).toBeNull();
});

it('raw cards are none without a query', async () => {
  const raw = (cards as Card[]).find((c) => c.grader === 'raw')!;
  expect(await loadSales(raw, 30, NOW)).toEqual({ kind: 'none' });
  expect(mockCalls).toHaveLength(0);
});

it('a hung request gives up after the timeout as offline', async () => {
  jest.useFakeTimers();
  try {
    mockResults.sales = 'hang';
    const p = loadSales(mew, 30, NOW);
    const settled = expect(p).rejects.toBeInstanceOf(SalesOffline);
    await jest.advanceTimersByTimeAsync(SALES_TIMEOUT_MS);
    await settled;
    expect(mockCalls.filter((c) => c.op === 'abortSignal')).toHaveLength(1);
    expect(mockCalls).toContainEqual({ table: 'sales', op: 'retry', args: [false] });
  } finally {
    jest.useRealTimers();
  }
});

it('a malformed cache entry reads as none', () => {
  useSalesCache.setState({ byKey: { 'psa:10:SV2a:205:ja|30': { kind: 'sales', rows: [] } as never } });
  expect(cachedSales(mew, 30)).toBeNull();
  useSalesCache.setState({ byKey: undefined as never });
  expect(cachedSales(mew, 30)).toBeNull();
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
