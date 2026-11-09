import type { CardPrice } from '../../services/comps';
import { saleRange, chartable, gradingLine, gradingRead, history, liquidity, ratio, realPoints, spread, spreadWord, trend } from '../cardStats';

const p = (marketCents: number, sales30d: number, series90: number[] = [marketCents], extra: object = {}): CardPrice & { points?: number } => ({
  marketCents,
  lowCents: Math.round(marketCents * 0.9),
  highCents: Math.round(marketCents * 1.1),
  sales30d,
  asOf: '2026-11-06',
  series90,
  ...extra,
});

describe('card stats', () => {
  it('does not count a carried-forward flat line as history', () => {
    const flat = p(5600, 0, Array(28).fill(5600));
    expect(realPoints(flat)).toBe(1);
    expect(chartable(flat)).toBe(false);
    expect(chartable({ ...flat, points: 2 })).toBe(false);
    expect(chartable({ ...flat, points: 5 })).toBe(true);
  });

  it('gives 90-day stats only with enough points over enough days', () => {
    const s = Array.from({ length: 91 }, (_, i) => 1000 + i * 2);
    // High takes the 30-day p90 of real sales (1298), which the smoothed median line never reaches.
    expect(history(p(1180, 20, s, { points: 40 }))).toEqual({ high: 1298, low: 1000, change: expect.closeTo(0.18, 6), days: 90 });
    expect(history(p(1180, 20, s, { points: 4 }))).toBeNull();
    expect(history(p(1180, 20, s.slice(-20), { points: 20 }))).toBeNull();
  });

  it('words', () => {
    expect([liquidity(24), liquidity(4), liquidity(1)]).toEqual(['Liquid', 'Slow', 'Stale']);
    expect([trend(0.08), trend(0.01), trend(-0.2)]).toEqual(['Rising', 'Flat', 'Falling']);
    expect(spread(p(1000, 3))).toBeNull();
    expect(spreadWord(spread(p(1000, 8))!)).toBeNull(); // ±10% → 20%: fair, unsaid
    expect(spreadWord(0.1)).toBe('Tight range');
  });

  it('ratios need sales on graded sides', () => {
    expect(ratio(p(40000, 10), p(10000, 0), true, false)).toBe(4);
    expect(ratio(p(40000, 2), p(10000, 0), true, false)).toBeNull();
  });

  it('grading math states the PSA 10 share needed', () => {
    // raw $50 + $33 = $83. PSA 9 $60 nets $51.75; PSA 10 $200 nets $173.20 → (83−51.75)/(173.2−51.75) ≈ 26%.
    const r = gradingRead(p(5000, 0), p(20000, 12), p(6000, 15));
    expect(r).toMatchObject({ kind: 'odds', oneIn: 4 });
    expect(gradingLine(r!)).toBe('Grading pays if about 1 in 4 come back PSA 10.');
    expect(gradingRead(p(5000, 0), p(30000, 12), p(15000, 15))).toEqual({ kind: 'pays-at-9' });
    expect(gradingRead(p(50000, 0), p(40000, 12), p(20000, 15))).toEqual({ kind: 'never' });
    expect(gradingRead(p(5000, 0), p(20000, 2), p(6000, 15))).toBeNull();
  });

  it('90-day range comes from real sales, not the rolling median (Radiant Jirachi PSA 10)', () => {
    const median = Array.from({ length: 91 }, (_, i) => Math.round(11040 + ((18000 - 11040) * i) / 90));
    const base = { ...p(18000, 6, median, { points: 20 }), lowCents: 14624, highCents: 20500 };
    // Old answers: median line widened by the 30-day p10/p90 and the last sale.
    expect(saleRange({ ...base, lastSale: { day: '2026-11-02', cents: 20500, count: 2 } })).toEqual({ low: 11040, high: 20500 });
    expect(history(base)!.high).toBe(20500);
    // With daily sales from the server, those decide.
    const sales90 = [
      { day: '2026-08-20', cents: 10500, count: 1 },
      { day: '2026-10-01', cents: 21900, count: 1 },
      { day: '2026-11-02', cents: 20500, count: 2 },
    ];
    expect(saleRange({ ...base, sales90 })).toEqual({ low: 10500, high: 21900 });
    // Raw (no sale count) keeps its own daily series.
    expect(saleRange({ ...p(5000, 0, [4000, 5000, 6000]), lowCents: 3000, highCents: 9000 })).toEqual({ low: 4000, high: 6000 });
  });
});
