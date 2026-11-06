// refreshCard against a stubbed Supabase client: skip rules, in-flight dedupe, 404 shut-off.

const mockInvoke = jest.fn();
const mockGetSession = jest.fn();
const mockCalls: { table: string; op: string; args: unknown[] }[] = [];
const mockRows: Record<string, unknown[]> = {};
function mockChain(table: string) {
  const c: Record<string, unknown> = {};
  for (const op of ['select', 'in', 'gte', 'order', 'limit', 'eq'])
    c[op] = (...args: unknown[]) => {
      mockCalls.push({ table, op, args });
      return c;
    };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: mockRows[table] ?? [], error: null }).then(res, rej);
  return c;
}

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (t: string) => mockChain(t),
  },
}));

import cards from '../../mocks/cards.json';
import { cardKey } from '../../pricing/cardKey';
import { usePrices } from '../../store/prices';
import type { Card } from '../../types';
import { CON_MIN_AGE_MS, refreshCard, refreshCards, refreshPrices, resetRefreshForTests, type CardPrice } from '../comps';

const mew = { ...(cards as Card[])[0], imageFrontUrl: 'x' };
const NOW = Date.parse('2026-11-06T12:00:00Z');
const base: CardPrice = { marketCents: 1, lowCents: 1, highCents: 1, sales30d: 1, asOf: '2026-11-06', series90: [1] };

beforeEach(() => {
  resetRefreshForTests();
  mockInvoke.mockReset();
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } });
  usePrices.setState({ byKey: {} });
  mockCalls.length = 0;
  for (const k of Object.keys(mockRows)) delete mockRows[k];
});

const H = 3_600_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const priceDailyCalls = () => mockCalls.filter((c) => c.table === 'price_daily' && c.op === 'select').length;

describe('refreshCard', () => {
  it('skips fresh comps unless forced', async () => {
    usePrices.setState({ byKey: { [cardKey(mew)]: { ...base, refreshedAt: '2026-11-06T10:00:00Z' } } });
    expect(await refreshCard(mew, { now: NOW })).toBe('fresh');
    expect(mockInvoke).not.toHaveBeenCalled();
    mockInvoke.mockResolvedValue({ data: { status: 'refreshed' }, error: null });
    expect(await refreshCard(mew, { force: true, now: NOW })).toBe('refreshed');
    expect(mockInvoke).toHaveBeenCalledWith('comps-refresh', { body: { cardKey: cardKey(mew), force: true } });
  });

  it('skips without a session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await refreshCard(mew)).toBe('skipped');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shares one call per card_key while it runs', async () => {
    let resolve!: (v: unknown) => void;
    mockInvoke.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = refreshCard(mew);
    const b = refreshCard(mew);
    expect(a).toBe(b);
    await Promise.resolve();
    await Promise.resolve();
    resolve({ data: { status: 'fresh' }, error: null });
    expect(await a).toBe('fresh');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('stops calling once the function is missing (404)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 404 } } });
    expect(await refreshCard(mew, { force: true })).toBe('skipped');
    expect(await refreshCard(mew, { force: true })).toBe('skipped');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('reports failures without throwing', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));
    expect(await refreshCard(mew, { force: true })).toBe('failed');
    mockInvoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } });
    expect(await refreshCard(mew, { force: true })).toBe('failed');
    mockInvoke.mockResolvedValueOnce({ data: { status: 'throttled' }, error: null });
    expect(await refreshCard(mew, { force: true })).toBe('fresh');
  });

  it('refreshes several cards and keeps their order', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'refreshed' }, error: null });
    const many = (cards as Card[]).slice(0, 5).map((c) => ({ ...c, imageFrontUrl: 'x' }));
    expect(await refreshCards(many, { force: true })).toEqual(['refreshed', 'refreshed', 'refreshed', 'refreshed', 'refreshed']);
  });

  it('treats a card the server says you do not own (not synced yet) as skipped', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'not_owned' }, error: null });
    expect(await refreshCard(mew, { force: true })).toBe('skipped');
  });

  it('does not ask again within 6 h of an attempt, whatever came of it, unless forced', async () => {
    usePrices.setState({ byKey: { [cardKey(mew)]: { ...base, refreshedAt: ago(8 * H) } } });
    mockInvoke.mockResolvedValue({ data: { status: 'throttled' }, error: null });
    expect(await refreshCard(mew, { now: NOW })).toBe('fresh');
    expect(await refreshCard(mew, { now: NOW + 5 * H })).toBe('skipped');
    mockInvoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } });
    expect(await refreshCard(mew, { now: NOW + 7 * H })).toBe('failed');
    expect(await refreshCard(mew, { now: NOW + 8 * H })).toBe('skipped');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(await refreshCard(mew, { force: true, now: NOW + 8 * H })).toBe('fresh');
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it('calls onStart only when the server is really asked', async () => {
    const onStart = jest.fn();
    usePrices.setState({ byKey: { [cardKey(mew)]: { ...base, refreshedAt: ago(2 * H) } } });
    expect(await refreshCard(mew, { now: NOW, onStart })).toBe('fresh');
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await refreshCard(mew, { force: true, onStart })).toBe('skipped');
    expect(onStart).not.toHaveBeenCalled();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    mockInvoke.mockResolvedValue({ data: { status: 'refreshed' }, error: null });
    const joined = jest.fn();
    const a = refreshCard(mew, { force: true, onStart });
    refreshCard(mew, { force: true, onStart: joined });
    await a;
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(joined).toHaveBeenCalledTimes(1);
  });

  it('with comps-refresh missing, a pull still reloads price_daily', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 404 } } });
    expect(await refreshCard(mew, { force: true })).toBe('skipped');
    expect(priceDailyCalls()).toBe(1);
    expect(await refreshCard(mew, { force: true })).toBe('skipped');
    expect(priceDailyCalls()).toBe(2);
    expect(await refreshCard(mew)).toBe('skipped'); // not a pull: nothing
    expect(priceDailyCalls()).toBe(2);
    const many = (cards as Card[]).slice(0, 4).map((c) => ({ ...c, imageFrontUrl: 'x' }));
    expect(await refreshCards(many, { force: true })).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
    expect(priceDailyCalls()).toBe(3); // one query for all of them
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("con mode's pull skips cards written in the last hour", async () => {
    const [a, b] = (cards as Card[]).slice(0, 2).map((c) => ({ ...c, imageFrontUrl: 'x' }));
    usePrices.setState({
      byKey: { [cardKey(a)]: { ...base, refreshedAt: ago(30 * 60_000) }, [cardKey(b)]: { ...base, refreshedAt: ago(2 * H) } },
    });
    mockInvoke.mockResolvedValue({ data: { status: 'refreshed' }, error: null });
    expect(await refreshCards([a, b], { force: true, now: NOW, minAgeMs: CON_MIN_AGE_MS })).toEqual(['fresh', 'refreshed']);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('comps-refresh', { body: { cardKey: cardKey(b), force: true } });
  });
});

describe('refreshPrices', () => {
  it('asks for the newest days first, with room for 91 per card', async () => {
    const many = (cards as Card[]).slice(0, 3).map((c) => ({ ...c, imageFrontUrl: 'x' }));
    const keys = new Set(many.map(cardKey)).size;
    await refreshPrices(many);
    const q = mockCalls.filter((c) => c.table === 'price_daily');
    expect(q.find((c) => c.op === 'order')?.args).toEqual(['day', { ascending: false }]);
    expect(q.find((c) => c.op === 'limit')?.args).toEqual([keys * 91]);
  });

  it('keeps the newest row when rows come back newest first', async () => {
    const key = cardKey(mew);
    mockRows.price_daily = [
      { card_key: key, day: '2026-11-06', market_cents: 200, low_cents: 1, high_cents: 1, sales_30d: 3 },
      { card_key: key, day: '2026-11-05', market_cents: 100, low_cents: 1, high_cents: 1, sales_30d: 3 },
    ];
    await refreshPrices([mew]);
    expect(usePrices.getState().byKey[key]).toMatchObject({ marketCents: 200, asOf: '2026-11-06', series90: [100, 200] });
  });
});
