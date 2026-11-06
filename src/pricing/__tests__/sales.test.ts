import type { SalesResult } from '../../types';
import { outlier, salesCount, salesPoints, salesValues, stripScale, summarize } from '../sales';

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
  it('flags prices outside 1.5×IQR when the IQR is wide', () => {
    const v = [800, 900, 1000, 1100, 1200, 1300, 1400];
    // q1 950, q3 1250, IQR 300 → fence 450 (beats 10% of median, 110) → 500 and 1700
    expect(outlier(1701, v)).toBe('above');
    expect(outlier(1700, v)).toBeNull();
    expect(outlier(499, v)).toBe('below');
    expect(outlier(1000, v)).toBeNull();
  });
  it('uses 10% of the median when the IQR is narrow', () => {
    const v = [980, 1000, 1010, 1020, 1030, 1050, 1080];
    // q1 1005, q3 1040; 1.5×IQR 52.5 < 10% of 1020 = 102 → 903 and 1142
    expect(outlier(1100, v)).toBeNull();
    expect(outlier(1143, v)).toBe('above');
    expect(outlier(902, v)).toBe('below');
  });
  it('all-equal prices do not flag small differences', () => {
    const v = [1000, 1000, 1000, 1000, 1000, 1000];
    expect(outlier(1001, v)).toBeNull();
    expect(outlier(999, v)).toBeNull();
    expect(outlier(1101, v)).toBe('above');
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
  it('caps a day at 50 in both values and count, and survives junk counts', () => {
    const big: SalesResult = {
      kind: 'daily',
      rows: [
        { day: '2026-11-05', sales: 80, avgCents: 100 },
        { day: '2026-11-04', sales: 2.7, avgCents: 200 },
        { day: '2026-11-03', sales: NaN, avgCents: 300 },
        { day: '2026-11-02', sales: undefined as never, avgCents: 400 },
        { day: '2026-11-01', sales: -3, avgCents: 500 },
      ],
    };
    expect(salesValues(big)).toHaveLength(52);
    expect(salesCount(big)).toBe(52);
    expect(summarize(salesValues(big))?.count).toBe(salesCount(big));
    expect(salesPoints(big)).toEqual([100, 200]);
  });
  it('none is empty', () => {
    expect(salesValues({ kind: 'none' })).toEqual([]);
    expect(salesCount({ kind: 'none' })).toBe(0);
  });
});

describe('stripScale', () => {
  it('scales to the non-outliers with padding and flags the outliers', () => {
    const v = [1000, 1010, 1020, 1030, 1040, 1050, 400, 5000];
    const s = stripScale(v, v);
    expect(s.flags).toEqual([null, null, null, null, null, null, 'below', 'above']);
    expect(s.lo).toBeCloseTo(1000 - 50 * 0.04);
    expect(s.hi).toBeCloseTo(1050 + 50 * 0.04);
  });
  it('all equal: pads around the price', () => {
    expect(stripScale([1000, 1000, 1000], [1000, 1000, 1000])).toEqual({ lo: 960, hi: 1040, flags: [null, null, null] });
  });
  it('empty is a harmless unit scale', () => {
    expect(stripScale([], [])).toEqual({ lo: 0, hi: 1, flags: [] });
  });
});
