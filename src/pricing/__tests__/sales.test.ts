import type { SalesResult } from '../../types';
import { outlier, salesCount, salesPoints, salesValues, summarize } from '../sales';

describe('summarize', () => {
  it('median and 10th/90th percentile, like price_daily', () => {
    expect(summarize([100, 200, 300, 400, 500])).toEqual({ count: 5, medianCents: 300, lowCents: 140, highCents: 460 });
  });
  it('one value is its own range', () => {
    expect(summarize([98000])).toEqual({ count: 1, medianCents: 98000, lowCents: 98000, highCents: 98000 });
  });
  it('ignores order and non-prices; null when empty', () => {
    expect(summarize([300, NaN, 100, 0, -5, 200])?.medianCents).toBe(200);
    expect(summarize([])).toBeNull();
    expect(summarize([0, NaN])).toBeNull();
  });
});

describe('outlier', () => {
  const v = [980, 1000, 1010, 1020, 1030, 1050, 1080];
  it('flags prices outside 1.5×IQR', () => {
    // q1 1005, q3 1040, IQR 35 → fences 952.5 and 1092.5
    expect(outlier(1093, v)).toBe('above');
    expect(outlier(1092, v)).toBeNull();
    expect(outlier(952, v)).toBe('below');
    expect(outlier(1020, v)).toBeNull();
  });
  it('needs at least five values', () => {
    expect(outlier(5000, [1000, 1000, 1000, 1000])).toBeNull();
    expect(outlier(5000, [1000, 1000, 1000, 1000, 1000])).toBe('above');
  });
});

describe('values from a result', () => {
  const daily: SalesResult = { kind: 'daily', rows: [{ day: '2026-11-05', sales: 3, avgCents: 100 }, { day: '2026-11-04', sales: 1, avgCents: 200 }] };
  const sales: SalesResult = {
    kind: 'sales',
    rows: [{ source: 'ebay', listingId: 'a', soldDay: '2026-11-05', soldAt: null, priceCents: 500, kind: 'auction', url: null }],
  };
  it('weights day averages by their sales, one point per day', () => {
    expect(salesValues(daily)).toEqual([100, 100, 100, 200]);
    expect(salesPoints(daily)).toEqual([100, 200]);
    expect(salesCount(daily)).toBe(4);
    expect(summarize(salesValues(daily))?.medianCents).toBe(100);
  });
  it('one value per sale', () => {
    expect(salesValues(sales)).toEqual([500]);
    expect(salesPoints(sales)).toEqual([500]);
    expect(salesCount(sales)).toBe(1);
  });
  it('none is empty', () => {
    expect(salesValues({ kind: 'none' })).toEqual([]);
    expect(salesCount({ kind: 'none' })).toBe(0);
  });
});
