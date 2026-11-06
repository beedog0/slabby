// refreshCard against a stubbed Supabase client: skip rules, in-flight dedupe, 404 shut-off.

const mockInvoke = jest.fn();
const mockGetSession = jest.fn();
const mockQuery = { select: () => mockQuery, in: () => mockQuery, gte: () => mockQuery, limit: async () => ({ data: [], error: null }) };

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: () => mockQuery,
  },
}));

import cards from '../../mocks/cards.json';
import { cardKey } from '../../pricing/cardKey';
import { usePrices } from '../../store/prices';
import type { Card } from '../../types';
import { refreshCard, refreshCards, resetRefreshForTests, type CardPrice } from '../comps';

const mew = { ...(cards as Card[])[0], imageFrontUrl: 'x' };
const NOW = Date.parse('2026-11-06T12:00:00Z');
const base: CardPrice = { marketCents: 1, lowCents: 1, highCents: 1, sales30d: 1, asOf: '2026-11-06', series90: [1] };

beforeEach(() => {
  resetRefreshForTests();
  mockInvoke.mockReset();
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } });
  usePrices.setState({ byKey: {} });
});

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
});
