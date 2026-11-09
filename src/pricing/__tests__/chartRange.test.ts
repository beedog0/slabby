import { chartRanges, rangeSeries } from '../cardStats';
import { denseHistory, lastSale } from '../../../supabase/functions/_shared/catalog-math';
import type { CardPrice } from '../../services/comps';

const base: CardPrice = { marketCents: 100, lowCents: 90, highCents: 110, sales30d: 3, asOf: '2026-11-08', series90: [] };
const row = (day: string, c: number) => ({ day, market_cents: c, low_cents: c, high_cents: c, sales_30d: 1 });

describe('denseHistory', () => {
  it('fills every day from first to last row, carrying forward', () => {
    expect(denseHistory([row('2026-11-01', 5), row('2026-11-04', 8), row('2026-11-02', 6)])).toEqual({ histFrom: '2026-11-01', hist: [5, 6, 6, 8] });
    expect(denseHistory([])).toBeNull();
  });
});

describe('lastSale', () => {
  it('picks the latest day with a sale', () => {
    expect(lastSale({ '2026-09-01': { average: 40.5, count: 2 }, '2026-10-12': { average: 52.25, count: 1 }, '2026-11-01': { average: 60, count: 0 } })).toEqual({
      day: '2026-10-12',
      cents: 5225,
      count: 1,
    });
    expect(lastSale({})).toBeNull();
  });
});

describe('rangeSeries', () => {
  // 180 days ending today; prices change every 20 days, so the last 30 days hold two real prices.
  const hist = Array.from({ length: 180 }, (_, i) => 1000 + Math.floor(i / 20) * 10);
  const p = { ...base, histFrom: '2026-05-13', hist };
  it('cuts the window from today and dates it by the last day', () => {
    const r = rangeSeries(p, 90, '2026-11-08');
    expect(r?.values).toHaveLength(90);
    expect(r?.asOf).toBe('2026-11-08');
    expect(rangeSeries(p, 180, '2026-11-08')?.values).toHaveLength(180);
  });
  it('hides a window with fewer than 3 real prices', () => {
    expect(rangeSeries(p, 30, '2026-11-08')).toBeNull();
    expect(chartRanges(p, '2026-11-08')).toEqual([90, 180]);
  });
  it('keeps old sales when the last one is months back', () => {
    const quiet = { ...base, histFrom: '2026-05-13', hist: [500, 520, 540, 560] };
    expect(chartRanges(quiet, '2026-11-08')).toEqual([180]);
    expect(rangeSeries(quiet, 180, '2026-11-08')).toEqual({ values: [500, 520, 540, 560], asOf: '2026-05-16' });
  });
  it('falls back to series90 for answers cached before the 180-day history', () => {
    const old = { ...base, series90: Array.from({ length: 90 }, (_, i) => 100 + i), points: 90 };
    expect(chartRanges(old, '2026-11-08')).toEqual([30, 90]);
    expect(rangeSeries(old, 30, '2026-11-08')?.values).toHaveLength(30);
  });
});
