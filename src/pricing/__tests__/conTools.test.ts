import { DEFAULT_RULES, type PricingRules } from '../../types';
import { bundle, floor, floorWithBasis, lastDayActive, lastDayEnd, trade, verdictAt, type Inputs } from '../rules';

const NOW = Date.parse('2026-11-08T20:00:00Z');
const on: PricingRules = { ...DEFAULT_RULES, lastDayCutPct: 10, lastDayUntil: '2026-11-09T08:00:00Z' };
const card = (marketCents: number, low30Cents: number, paidCents: number | null, rules = DEFAULT_RULES): Inputs => ({
  marketCents,
  low30Cents,
  paidCents,
  rules,
  now: NOW,
});

describe('last-day prices', () => {
  it('is on until its end time', () => {
    expect(lastDayActive(on, NOW)).toBe(true);
    expect(lastDayActive(on, Date.parse('2026-11-09T08:00:01Z'))).toBe(false);
    expect(lastDayActive(DEFAULT_RULES, NOW)).toBe(false);
  });
  it('ends at local midnight', () => {
    const end = new Date(lastDayEnd(NOW));
    expect(end.getHours()).toBe(0);
    expect(end.getTime()).toBeGreaterThan(NOW);
    expect(end.getTime() - NOW).toBeLessThanOrEqual(24 * 3600 * 1000);
  });
  it('drops a rule floor by the cut', () => {
    // 30d low $200, floor −5% = $190; last day −10% = $171 → rounded to $170.
    expect(floor(card(25_000, 20_000, null))).toBe(19_000);
    expect(floorWithBasis(card(25_000, 20_000, null, on))).toEqual({ cents: 17_000, basis: 'lastDay' });
  });
  it('still never sells at a loss', () => {
    expect(floorWithBasis(card(25_000, 20_000, 18_000, on))).toEqual({ cents: 18_000, basis: 'paid' });
  });
  it('leaves a per-card floor alone', () => {
    expect(floorWithBasis({ ...card(25_000, 20_000, null, on), overrides: { floor: 21_000 } })).toEqual({ cents: 21_000, basis: 'override' });
  });
});

describe('bundle', () => {
  it('adds the asks and floors', () => {
    const b = bundle([card(10_000, 9_000, null), card(20_000, 18_000, null)]);
    expect(b.count).toBe(2);
    expect(b.marketCents).toBe(30_000);
    expect(b.askCents).toBe(11_000 + 22_000);
    expect(b.floorCents).toBe(8_500 + 17_000);
    expect(b.floorBasis).toBe('cards');
  });
  it('lets a winner carry a loser, but never sells the lot at a loss', () => {
    // Card A paid $150 (floor alone would be $150), card B paid $50 (floor $170).
    const a = card(10_000, 9_000, 15_000);
    const b = card(20_000, 18_000, 5_000);
    expect(floor(a) + floor(b)).toBe(11_000 + 17_000); // A is held at its ask alone
    const q = bundle([a, b]);
    expect(q.floorCents).toBe(8_500 + 17_000);
    expect(q.paidCents).toBe(20_000);
    const lossy = bundle([card(10_000, 9_000, 30_000), b]);
    expect(lossy.floorCents).toBe(lossy.askCents);
    expect(lossy.floorBasis).toBe('ask');
  });
  it('raises the floor to what the lot cost', () => {
    const q = bundle([card(10_000, 9_000, 14_000), card(20_000, 18_000, 13_000)]);
    expect(q.floorCents).toBe(27_000);
    expect(q.floorBasis).toBe('paid');
  });
  it('rates an offer on the totals', () => {
    expect(verdictAt(30_000, 25_500, 33_000).kind).toBe('take');
    expect(verdictAt(23_000, 25_500, 33_000)).toMatchObject({ kind: 'counter', counterAt: 25_500 });
    expect(verdictAt(15_000, 25_500, 33_000).kind).toBe('pass');
  });
});

describe('trade', () => {
  it('is even within 5%', () => {
    expect(trade([10_000], [10_400]).kind).toBe('even');
  });
  it('leans your way when theirs is worth more', () => {
    const t = trade([10_000, 5_000], [20_000]);
    expect(t).toMatchObject({ mineCents: 15_000, theirsCents: 20_000, gapCents: 5_000, kind: 'yours' });
    expect(t.gapPct).toBeCloseTo(0.25);
  });
  it('leans their way when yours is worth more', () => {
    expect(trade([20_000], [15_000]).kind).toBe('theirs');
  });
  it('handles an empty side', () => {
    expect(trade([], []).kind).toBe('even');
    expect(trade([10_000], []).kind).toBe('theirs');
  });
});
