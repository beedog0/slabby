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
