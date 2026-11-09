import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { rowFor, summarize } from '../portfolio';
import { tableReady } from '../tableReady';

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
