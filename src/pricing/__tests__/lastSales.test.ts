import type { CardPrice } from '../../services/comps';
import { canAutoPrice, headline, saleDaysNewestFirst, withHeadline } from '../lastSales';

const TODAY = '2026-11-09';

describe('last 5 sales', () => {
  it('takes the median of the last 5 sales, count-weighted, one line per day', () => {
    const h = headline(
      [
        { day: '2026-11-02', cents: 20500, count: 2 },
        { day: '2026-10-20', cents: 16000, count: 1 },
        { day: '2026-10-09', cents: 31000, count: 3 }, // only 2 of these 3 are needed
        { day: '2026-09-01', cents: 9000, count: 1 }, // older than the last 5
      ],
      TODAY,
    )!;
    // 205, 205, 160, 310, 310 → median 205
    expect(h).toEqual({
      basis: 'median5',
      cents: 20500,
      sales: 7,
      lines: [
        { day: '2026-11-02', cents: 20500, count: 2 },
        { day: '2026-10-20', cents: 16000, count: 1 },
        { day: '2026-10-09', cents: 31000, count: 3 },
      ],
    });
  });

  it('reaches back as far as 180 days for 5 sales', () => {
    const days = [0, 30, 60, 100, 170].map((ago, i) => ({ day: dayAgo(ago), cents: 10000 + i * 1000, count: 1 }));
    expect(headline(days, TODAY)).toMatchObject({ basis: 'median5', cents: 12000 });
  });

  it('under 5 sales in 180 days: last sold, no median', () => {
    const h = headline(
      [
        { day: '2026-09-28', cents: 204000, count: 1 },
        { day: '2026-08-12', cents: 190000, count: 2 },
        { day: dayAgo(200), cents: 150000, count: 4 }, // outside the lookback
      ],
      TODAY,
    )!;
    expect(h).toMatchObject({ basis: 'lastSold', cents: 204000, sales: 3, reason: 'few' });
    expect(h.lines.map((l) => l.day)).toEqual(['2026-09-28', '2026-08-12']);
  });

  it('5 sales but the newest is over 90 days old: last sold, marked old', () => {
    const days = [100, 110, 120, 130, 140].map((ago) => ({ day: dayAgo(ago), cents: 5000, count: 1 }));
    expect(headline(days, TODAY)).toMatchObject({ basis: 'lastSold', reason: 'old' });
  });

  it('merges duplicate rows for one day and drops empty ones', () => {
    expect(
      saleDaysNewestFirst(
        [
          { day: '2026-11-02T00:00:00Z', cents: 20000, count: 1 },
          { day: '2026-11-02', cents: 23000, count: 2 },
          { day: '2026-11-01', cents: 0, count: 3 },
          { day: '2026-10-31', cents: 9000, count: 0 },
        ],
        TODAY,
      ),
    ).toEqual([{ day: '2026-11-02', cents: 22000, count: 3 }]);
    expect(headline([], TODAY)).toBeNull();
  });

  it('applies to a CardPrice and gates auto pricing', () => {
    const p: CardPrice = { marketCents: 18000, lowCents: 14624, highCents: 20500, sales30d: 6, asOf: TODAY, series90: [18000] };
    const five = [1, 2, 3, 4, 5].map((ago) => ({ day: dayAgo(ago), cents: 20000 + ago * 100, count: 1 }));
    const h = withHeadline(p, five, TODAY);
    expect(h).toMatchObject({ marketCents: 20300, basis: 'median5', median30Cents: 18000 });
    expect(canAutoPrice(h)).toBe(true);
    const thin = withHeadline(p, five.slice(0, 2), TODAY);
    expect(thin).toMatchObject({ marketCents: 20100, basis: 'lastSold' });
    expect(canAutoPrice(thin)).toBe(false);
    expect(withHeadline(p, null, TODAY)).toBe(p);
    expect(canAutoPrice(p)).toBe(true);
  });
});

function dayAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
