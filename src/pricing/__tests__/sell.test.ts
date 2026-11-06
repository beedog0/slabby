import { costBasis, sellRating, sellRead, vsMarket } from '../sell';

describe('costBasis', () => {
  it('uses what you paid, the pack price for a pull, else $0, and null when not sure', () => {
    expect(costBasis({ kind: 'paid', cents: 20_000 })).toBe(20_000);
    expect(costBasis({ kind: 'pulled', packCents: 499 })).toBe(499);
    expect(costBasis({ kind: 'pulled', packCents: null })).toBe(0);
    expect(costBasis({ kind: 'unknown' })).toBeNull();
    expect(costBasis(null)).toBeNull();
  });
});

describe('vsMarket', () => {
  it('reads within 2% as at market', () => {
    expect(vsMarket(25_000, 25_000)?.place).toBe('at');
    expect(vsMarket(25_400, 25_000)?.place).toBe('at');
    expect(vsMarket(24_600, 25_000)?.place).toBe('at');
  });
  it('gives the gap in dollars and percent', () => {
    expect(vsMarket(28_000, 25_000)).toEqual({ place: 'above', deltaCents: 3_000, pct: 0.12 });
    expect(vsMarket(22_500, 25_000)).toEqual({ place: 'below', deltaCents: -2_500, pct: -0.1 });
  });
  it('is null without a market', () => {
    expect(vsMarket(10_000, null)).toBeNull();
    expect(vsMarket(10_000, 0)).toBeNull();
  });
});

describe('sellRating', () => {
  it('rates profit against what you paid', () => {
    expect(sellRating(28_000, { kind: 'paid', cents: 20_000 })).toEqual({ kind: 'strong', profitCents: 8_000, pct: 0.4, costCents: 20_000 });
    expect(sellRating(22_000, { kind: 'paid', cents: 20_000 }).kind).toBe('profit');
    expect(sellRating(20_050, { kind: 'paid', cents: 20_000 }).kind).toBe('even');
    expect(sellRating(18_000, { kind: 'paid', cents: 20_000 })).toMatchObject({ kind: 'loss', profitCents: -2_000, pct: -0.1 });
  });
  it('calls a pull with no pack price pure profit', () => {
    expect(sellRating(5_000, { kind: 'pulled', packCents: null })).toEqual({ kind: 'pure', profitCents: 5_000, pct: null, costCents: 0 });
  });
  it('measures a pull from its pack price when known', () => {
    expect(sellRating(5_000, { kind: 'pulled', packCents: 500 })).toMatchObject({ kind: 'strong', profitCents: 4_500, pct: 9 });
  });
  it('gives no rating when not sure', () => {
    expect(sellRating(5_000, { kind: 'unknown' })).toEqual({ kind: 'unknown', profitCents: null, pct: null, costCents: null });
  });
});

describe('sellRead', () => {
  it('flags a stretch ask, a quick one, and one under the floor', () => {
    expect(sellRead(30_000, vsMarket(30_000, 25_000), 20_000)).toEqual(['Expect counters']);
    expect(sellRead(21_000, vsMarket(21_000, 25_000), 23_000)).toEqual(['Priced to move', 'Under your floor']);
    expect(sellRead(25_000, vsMarket(25_000, 25_000), null)).toEqual(['In line with sales']);
  });
});
