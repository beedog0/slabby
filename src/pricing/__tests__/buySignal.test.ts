import type { CardPrice } from '../../services/comps';
import { buySignal, change30, momentumWord } from '../buySignal';

/** 91 daily points: falls from `start` to `mid` over 60 days, then moves to `end` over 30. */
function series(start: number, mid: number, end: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 60; i++) out.push(Math.round(start + ((mid - start) * i) / 60));
  for (let i = 1; i <= 30; i++) out.push(Math.round(mid + ((end - mid) * i) / 30));
  return out;
}

const price = (s: number[], sales30d = 14, extra: object = {}): CardPrice & { points?: number } => ({
  marketCents: s[s.length - 1],
  lowCents: 0,
  highCents: 0,
  sales30d,
  asOf: '2026-11-08',
  series90: s,
  points: 60,
  ...extra,
});

describe('buy signal', () => {
  it('reads near the low, stopped falling, liquid as a good time to buy', () => {
    const s = series(162000, 124000, 124000);
    const r = buySignal(price(s), true)!;
    expect(r.verdict).toBe('buy');
    expect(r.needle).toBeLessThan(1 / 3);
    expect(r.factors.map((f) => f.word)).toEqual(['Near its low', 'Stopped falling', 'Sells often']);
    expect(r.because).toBe('Near its 90-day low, prices have stopped falling, and it sells about 3 times a week.');
  });

  it('says hold off while it is still dropping fast, even near the low', () => {
    const r = buySignal(price(series(150000, 140000, 110000)), true)!;
    expect(r.verdict).toBe('hold');
    expect(r.needle).toBeGreaterThan(2 / 3);
    expect(r.because).toContain("it's still dropping fast (−21% in 30 days)");
  });

  it('says hold off near the high while heating up, fair when merely high', () => {
    expect(buySignal(price(series(100000, 100000, 130000)), true)!.verdict).toBe('hold');
    expect(buySignal(price(series(100000, 125000, 128000)), true)!.verdict).toBe('fair');
  });

  it('mid-range is fair, and the needle stays in the middle third', () => {
    const s = series(130000, 100000, 112000); // 40% up its range, rising but not near the high
    const r = buySignal(price(s), true)!;
    expect(r.verdict).toBe('fair');
    expect(r.needle).toBeGreaterThan(1 / 3);
    expect(r.needle).toBeLessThan(2 / 3);
  });

  it('leaves demand out for raw', () => {
    const r = buySignal(price(series(5000, 4000, 4000), 0), false)!;
    expect(r.factors.map((f) => f.key)).toEqual(['position', 'momentum']);
    expect(r.because).toBe('Near its 90-day low and prices have stopped falling.');
  });

  it('hides when there is not enough real data', () => {
    const s = series(162000, 124000, 124000);
    expect(buySignal(price(s, 2), true)).toBeNull(); // too few graded sales
    expect(buySignal(price(s, 14, { points: 4 }), true)).toBeNull(); // carried-forward line
    expect(buySignal(price(s.slice(-20)), true)).toBeNull(); // under 30 days
    expect(buySignal(price(Array(91).fill(5000)), false)).toBeNull(); // flat range
    expect(buySignal(null, true)).toBeNull();
  });

  it('momentum words', () => {
    expect(change30([100, ...Array(29).fill(100), 110])).toBeCloseTo(0.1);
    expect([momentumWord(-0.1, 0), momentumWord(0.1, 0), momentumWord(-0.04, 0), momentumWord(0.04, 0), momentumWord(0, 0.1), momentumWord(0, 0)]).toEqual([
      'Dropping fast',
      'Heating up',
      'Cooling',
      'Warming',
      'Leveling off',
      'Steady',
    ]);
  });
});
