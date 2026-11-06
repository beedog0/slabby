import {
  addDays,
  bareNumber,
  numberMatches,
  rawToday,
  gradeKey,
  gradedDaily,
  percentile,
  rawDaily,
} from '../../../supabase/functions/_shared/comps-math';

describe('helpers', () => {
  it('percentile interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.5)).toBe(15);
  });
  it('adds days across months', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
  it('grade keys match PokemonPriceTracker', () => {
    expect(gradeKey('psa', 10)).toBe('psa10');
    expect(gradeKey('bgs', 9.5)).toBe('bgs9_5');
    expect(gradeKey('raw', null)).toBeNull();
  });
  it('strips set totals and leading zeros from numbers', () => {
    expect(bareNumber('199/165')).toBe('199');
    expect(bareNumber('004/102')).toBe('4');
    expect(bareNumber('205')).toBe('205');
  });
});

describe('gradedDaily', () => {
  const today = '2026-11-05';
  const sales = {
    '2026-11-05': { average: 100, count: 1 },
    '2026-11-01': { average: 120, count: 2 },
    '2026-10-20': { average: 80, count: 1 },
    '2026-09-01': { average: 500, count: 3 }, // outside the 30-day window for today
  };
  it('uses the trailing 30 days, weighted by count', () => {
    const rows = gradedDaily(sales, today, 1);
    expect(rows).toHaveLength(1);
    // values: 100, 120, 120, 80 → sorted 80,100,120,120 → median 110
    expect(rows[0]).toMatchObject({ day: today, market_cents: 11_000, sales_30d: 4 });
    expect(rows[0].low_cents).toBeLessThan(rows[0].market_cents);
    expect(rows[0].high_cents).toBe(12_000);
  });
  it('skips days with no sales in the window', () => {
    const rows = gradedDaily({ '2026-10-01': { average: 100, count: 1 } }, today, 90);
    // The 10-01 sale is inside the trailing window for 10-01 through 10-30 only.
    expect(rows).toHaveLength(30);
    expect(rows[0].day).toBe('2026-10-01');
    expect(rows[rows.length - 1].day).toBe('2026-10-30');
  });
});

describe('rawDaily', () => {
  it('carries the last market forward and gives a 30-day low/high', () => {
    const rows = rawDaily(
      [
        { date: '2026-11-01T00:00:00.000Z', market: 90 },
        { date: '2026-11-03T00:00:00.000Z', market: 100 },
      ],
      '2026-11-05',
      5,
    );
    expect(rows.map((r) => r.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(rows.map((r) => r.market_cents)).toEqual([9_000, 9_000, 10_000, 10_000, 10_000]);
    expect(rows[4].low_cents).toBeGreaterThanOrEqual(9_000);
    expect(rows[4].high_cents).toBe(10_000);
  });
});

import { fromDaily } from '../../services/comps';

describe('fromDaily', () => {
  it('builds the app price from price_daily rows in any order', () => {
    const p = fromDaily([
      { card_key: 'k', day: '2026-11-05', market_cents: 300, low_cents: 200, high_cents: 400, sales_30d: 9 },
      { card_key: 'k', day: '2026-11-04', market_cents: 250, low_cents: 200, high_cents: 400, sales_30d: 8 },
    ])!;
    expect(p).toMatchObject({ marketCents: 300, lowCents: 200, highCents: 400, sales30d: 9, asOf: '2026-11-05' });
    expect(p.series90).toEqual([250, 300]);
  });
  it('is null with no rows', () => {
    expect(fromDaily([])).toBeNull();
  });
});

describe('other games', () => {
  it('matches One Piece and Riftbound catalog numbers to label numbers', () => {
    expect(numberMatches('OP05-119', '119')).toBe(true);
    expect(numberMatches('OP05-119', '#119'.replace('#', ''))).toBe(true);
    expect(numberMatches('OP05-119', '120')).toBe(false);
    expect(numberMatches('OGN-001', '001')).toBe(true);
    expect(numberMatches('001/298', '1')).toBe(true);
    expect(numberMatches('T03a', 'T03A')).toBe(true);
    expect(numberMatches('199/165', '199')).toBe(true);
    expect(numberMatches('199/165', null)).toBe(false);
  });

  it('builds today from stored days and today\'s TCGplayer market', () => {
    const row = rawToday(
      [
        { day: '2026-11-03', market_cents: 1000 },
        { day: '2026-11-04', market_cents: 2000 },
      ],
      30,
      '2026-11-05',
    );
    expect(row).toMatchObject({ day: '2026-11-05', market_cents: 3000, sales_30d: 0 });
    expect(row!.low_cents).toBeGreaterThanOrEqual(1000);
    expect(row!.high_cents).toBeLessThanOrEqual(3000);
    expect(rawToday([], 12.5, '2026-11-05')).toMatchObject({ market_cents: 1250, low_cents: 1250, high_cents: 1250 });
  });
});

import { lastRawDay, lastSaleDay } from '../../../supabase/functions/_shared/comps-math';

describe('last sale', () => {
  it('takes the latest graded day with a sale and a price', () => {
    expect(
      lastSaleDay({
        '2026-11-01': { average: 120.4, count: 2 },
        '2026-11-04': { average: 99.995, count: 1 },
        '2026-11-05': { average: 0, count: 1 }, // no price
        '2026-11-06': { average: 140, count: 0 }, // no sale
      }),
    ).toEqual({ day: '2026-11-04', cents: 10_000 });
  });
  it('is null with no sales', () => {
    expect(lastSaleDay({})).toBeNull();
    expect(lastSaleDay({ '2026-11-01': { average: 50, count: 0 } })).toBeNull();
  });
  it('takes the latest raw market point', () => {
    expect(
      lastRawDay([
        { date: '2026-11-03T00:00:00.000Z', market: 12.5 },
        { date: '2026-11-01T00:00:00.000Z', market: 10 },
        { date: '2026-11-04T00:00:00.000Z', market: null },
      ]),
    ).toEqual({ day: '2026-11-03', cents: 1_250 });
    expect(lastRawDay([])).toBeNull();
  });
});

describe('fromDaily 90-day sales', () => {
  const row = (day: string, sales_30d: number) => ({ card_key: 'k', day, market_cents: 100, low_cents: 90, high_cents: 110, sales_30d });
  it('sums sales_30d on the last day and 30 and 60 days before, by date', () => {
    const p = fromDaily([row('2026-11-05', 9), row('2026-10-06', 7), row('2026-09-06', 4), row('2026-09-07', 100)])!;
    expect(p.sales90d).toBe(20);
  });
  it('counts a missing day as zero', () => {
    expect(fromDaily([row('2026-11-05', 9), row('2026-10-07', 7)])!.sales90d).toBe(9);
  });
});

import { isStale } from '../../services/comps';

describe('isStale', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('is stale past six hours or when unknown', () => {
    expect(isStale('2026-11-06T07:00:00Z', now)).toBe(false);
    expect(isStale('2026-11-06T05:59:00Z', now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
    expect(isStale(undefined, now)).toBe(true);
    expect(isStale('2026-11-06T11:00:00Z', now, 30 * 60_000)).toBe(true);
  });
});
