import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { rowFor, summarize } from '../portfolio';
import { lastSalesDay, recentBuys, recentSales, tableReady } from '../tableReady';

const rows = (cards as Card[]).map((c) => rowFor(c, DEFAULT_RULES));

describe('tableReady', () => {
  const t = tableReady(rows);
  it('lists owned cards for sale, priciest ask first', () => {
    expect(t.forSale.every((r) => r.card.status === 'owned' && r.card.plan === 'sell')).toBe(true);
    for (let i = 1; i < t.forSale.length; i++) expect(t.forSale[i - 1].ask ?? 0).toBeGreaterThanOrEqual(t.forSale[i].ask ?? 0);
  });
  it('agrees with the vault summary on count and floors', () => {
    const s = summarize(rows);
    expect(t.forSale.length).toBe(s.forSaleCount);
    expect(t.floorCents).toBe(s.floorTotalCents);
    expect(t.askCents).toBeGreaterThanOrEqual(t.floorCents);
  });
  it('is empty-safe', () => {
    expect(tableReady([])).toEqual({ forSale: [], askCents: 0, floorCents: 0, tradeOnly: 0 });
  });
});

describe('sales', () => {
  const base = rows[0].card;
  const sold = (id: string, soldAt: string, soldCents: number, paidCents: number | null) =>
    ({ card: { ...base, id, status: 'sold' as const, soldAt, soldCents, paidCents }, price: null }) as unknown as (typeof rows)[number];
  const r = [sold('a', '2026-11-07T15:00:00Z', 50_000, 40_000), sold('b', '2026-11-07T18:00:00Z', 20_000, null), sold('c', '2026-11-01T10:00:00Z', 9_000, 5_000)];
  it('sums the last day anything sold', () => {
    expect(lastSalesDay(r)).toEqual({ day: '2026-11-07', count: 2, soldCents: 70_000, profitCents: 10_000 });
    expect(lastSalesDay([])).toBeNull();
  });
  it('lists sales newest first', () => {
    expect(recentSales(r, 2).map((x) => x.card.id)).toEqual(['b', 'a']);
  });
});

describe('recentBuys', () => {
  const base = rows[0].card;
  const bought = (id: string, paidAt: string | null, createdAt: string, paidCents: number | null) =>
    ({ card: { ...base, id, paidAt, createdAt, paidCents }, price: null }) as unknown as (typeof rows)[number];
  it('lists cards with a price paid, newest first, falling back to when they were added', () => {
    const r = [bought('a', '2026-11-01', '2026-11-01', 100), bought('b', null, '2026-11-08', 200), bought('c', '2026-11-05', '2026-10-01', null)];
    expect(recentBuys(r).map((x) => x.card.id)).toEqual(['b', 'a']);
  });
});
