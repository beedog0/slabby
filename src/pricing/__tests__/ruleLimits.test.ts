import { DEFAULT_RULES } from '../../types';
import { clampPct, pctLimits, pctWord } from '../rules';

describe('pricing rule limits', () => {
  const r = { askPct: 10, floorPct: -5, buyTargetPct: -15, buyMaxPct: -5 };
  it('keeps ask at or above market and at or above the floor', () => {
    expect(clampPct(r, 'askPct', -3)).toBe(0);
    expect(clampPct({ ...r, floorPct: 4 }, 'askPct', 2)).toBe(4);
  });
  it('keeps the floor at or below the ask', () => {
    expect(clampPct(r, 'floorPct', 12)).toBe(10);
    expect(clampPct(r, 'floorPct', -8)).toBe(-8);
  });
  it('keeps max at or below market and target at or below max', () => {
    expect(clampPct(r, 'buyMaxPct', 3)).toBe(0);
    expect(clampPct(r, 'buyMaxPct', -20)).toBe(-15);
    expect(clampPct(r, 'buyTargetPct', -2)).toBe(-5);
    expect(pctLimits(r, 'buyTargetPct')).toEqual({ min: -100, max: -5 });
  });
  it('defaults are valid', () => {
    for (const k of ['askPct', 'floorPct', 'buyTargetPct', 'buyMaxPct'] as const) expect(clampPct(DEFAULT_RULES, k, DEFAULT_RULES[k])).toBe(DEFAULT_RULES[k]);
  });
  it('words follow the sign', () => {
    expect([pctWord(5, 'market'), pctWord(-5, 'market'), pctWord(0, 'market')]).toEqual(['above market', 'below market', 'at market']);
  });
});
