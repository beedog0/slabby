import { extendHistory } from '../../../supabase/functions/_shared/catalog-math';
import { ALL, chartRanges, rangeSeries } from '../cardStats';
import type { CardPrice } from '../../services/comps';

describe('extendHistory', () => {
  it('spreads weekly points over days ahead of the daily history', () => {
    const r = extendHistory({ histFrom: '2024-01-15', hist: [9, 9] }, { from_day: '2024-01-01', cents: [5, null, 7] });
    expect(r).toEqual({ histFrom: '2024-01-01', hist: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 9, 9] });
  });
  it('drops leading empty weeks and works without daily history', () => {
    const r = extendHistory(null, { from_day: '2024-01-01', cents: [null, 4, 6] });
    expect(r?.histFrom).toBe('2024-01-08');
    expect(r?.hist).toHaveLength(8);
    expect(r?.hist[7]).toBe(6);
  });
  it('leaves daily history alone when weekly adds nothing older', () => {
    const d = { histFrom: '2024-01-01', hist: [1, 2] };
    expect(extendHistory(d, { from_day: '2024-01-01', cents: [3] })).toBe(d);
    expect(extendHistory(d, null)).toBe(d);
  });
});

describe('1Y and All ranges', () => {
  const p = (days: number): CardPrice => ({
    marketCents: 100, lowCents: 90, highCents: 110, sales30d: 3, asOf: '2026-11-08', series90: [],
    histFrom: new Date(Date.parse('2026-11-08T00:00:00Z') - (days - 1) * 86_400_000).toISOString().slice(0, 10),
    hist: Array.from({ length: days }, (_, i) => 100 + (i % 5)),
  });
  it('offers them only with enough history', () => {
    expect(chartRanges(p(180), '2026-11-08')).toEqual([30, 90, 180]);
    expect(chartRanges(p(300), '2026-11-08')).toEqual([30, 90, 180, ALL]);
    expect(chartRanges(p(640), '2026-11-08')).toEqual([30, 90, 180, 365, ALL]);
  });
  it('All covers everything, 1Y the last year', () => {
    expect(rangeSeries(p(640), ALL, '2026-11-08')?.values).toHaveLength(640);
    expect(rangeSeries(p(640), 365, '2026-11-08')?.values).toHaveLength(365);
  });
});
