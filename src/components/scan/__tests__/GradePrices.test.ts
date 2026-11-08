import { salesLine } from '../GradePrices';

const p = (sales30d: number) => ({ marketCents: 1000, lowCents: 900, highCents: 1100, sales30d, asOf: '2026-11-08', series90: [] });

describe('salesLine', () => {
  it('says how many sales a grade rests on', () => {
    expect(salesLine(p(8))).toBe('8 sales · 30 days');
    expect(salesLine(p(1))).toBe('Thin · 1 sale');
    expect(salesLine(p(0))).toBe('No sales · 30 days');
    expect(salesLine(null)).toBe('No sales yet');
  });
});
