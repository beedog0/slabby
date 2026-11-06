import { buyRating } from '../rules';

const p = { targetCents: 8_500, maxCents: 9_500, marketCents: 10_000 };

describe('buyRating', () => {
  it('bands an ask by target, max and market', () => {
    expect(buyRating(8_000, p).kind).toBe('steal');
    expect(buyRating(8_500, p).kind).toBe('steal');
    expect(buyRating(9_000, p).kind).toBe('good');
    expect(buyRating(9_500, p).kind).toBe('good');
    expect(buyRating(9_800, p).kind).toBe('fair');
    expect(buyRating(10_000, p).kind).toBe('fair');
    expect(buyRating(10_500, p).kind).toBe('over');
  });
  it('gives the deltas, share of market and counter', () => {
    const r = buyRating(9_000, p);
    expect(r.deltaToMax).toBe(-500);
    expect(r.deltaToMarket).toBe(-1_000);
    expect(r.pctOfMarket).toBeCloseTo(0.9);
    expect(r.counterAt).toBe(8_500);
  });
  it('flags asks under half of market', () => {
    expect(buyRating(4_000, p).suspicious).toBe(true);
    expect(buyRating(6_000, p).suspicious).toBe(false);
  });
});

import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { boughtIn, conBuySummary, rowFor } from '../portfolio';

describe('conBuySummary', () => {
  it('counts only this con\'s buys, against the market when you paid', () => {
    const all = (cards as Card[]).map((c, i) =>
      i === 0 ? { ...c, paidCents: 10_000, boughtConId: 'con-1', boughtMarketCents: 14_000 } : i === 1 ? { ...c, paidCents: 5_000, boughtConId: 'con-0' } : c,
    );
    const rows = all.map((c) => rowFor(c, DEFAULT_RULES));
    expect(boughtIn(rows, 'con-1').map((r) => r.card.id)).toEqual([all[0].id]);
    expect(conBuySummary(rows, 'con-1')).toEqual({ spentCents: 10_000, count: 1, underMarketCents: 4_000 });
  });
});
