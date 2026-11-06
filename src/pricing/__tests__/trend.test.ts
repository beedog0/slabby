import type { CardPrice } from '../../services/comps';
import { conFreshnessLine, freshnessLine, freshnessWorthShowing, trendSentence, trendVerdict, type Part } from '../trend';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const H = 3_600_000;

/** A series of `n` points rising linearly from `from` to `to`. */
const line = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));

const price = (o: Partial<CardPrice> = {}): CardPrice => ({
  marketCents: 10_800,
  lowCents: 9_000,
  highCents: 12_000,
  sales30d: 14,
  sales90d: 40,
  asOf: '2026-11-06',
  series90: line(91, 9_000, 10_800),
  ...o,
});
const text = (parts: Part[]) => parts.map((p) => p.text).join('');

describe('trendVerdict', () => {
  it('reads up, down and flat against the ±3% threshold', () => {
    const series = [...line(60, 10_000, 10_000), ...line(31, 10_000, 10_800)];
    expect(trendVerdict(price({ series90: series }), 30, { now: NOW })).toMatchObject({ direction: 'up', sales: 14, enough: true });
    expect(trendVerdict(price({ series90: line(91, 10_000, 9_400) }), 90, { now: NOW })).toMatchObject({ direction: 'down', sales: 40 });
    expect(trendVerdict(price({ series90: line(91, 10_000, 10_200) }), 90, { now: NOW }).direction).toBe('flat');
  });
  it('needs 5 sales over 30 days and 10 over 90', () => {
    expect(trendVerdict(price({ sales30d: 4 }), 30, { now: NOW }).enough).toBe(false);
    expect(trendVerdict(price({ sales30d: 5 }), 30, { now: NOW }).enough).toBe(true);
    expect(trendVerdict(price({ sales90d: 9 }), 90, { now: NOW }).enough).toBe(false);
  });
  it('falls back to the 30-day count when 90-day sales are unknown', () => {
    expect(trendVerdict(price({ sales90d: undefined, sales30d: 12 }), 90, { now: NOW })).toMatchObject({ sales: 12, enough: true });
  });
  it('is not enough when the last sale is older than the window or the series is short', () => {
    expect(trendVerdict(price({ lastSaleDay: '2026-09-30' }), 30, { now: NOW }).enough).toBe(false);
    expect(trendVerdict(price({ lastSaleDay: '2026-11-05' }), 30, { now: NOW }).enough).toBe(true);
    expect(trendVerdict(price({ series90: line(40, 9_000, 10_000) }), 90, { now: NOW }).enough).toBe(false);
    expect(trendVerdict(price({ series90: line(40, 9_000, 10_000) }), 30, { now: NOW }).enough).toBe(true);
  });
  it('raw cards count market points, not sales', () => {
    expect(trendVerdict(price({ sales30d: 0, series90: line(15, 1_000, 1_100) }), 30, { raw: true })).toMatchObject({ enough: true, sales: 0 });
    expect(trendVerdict(price({ sales30d: 0, series90: line(14, 1_000, 1_100) }), 30, { raw: true }).enough).toBe(false);
  });
  it('raw needs at least half the window in points as well as 15', () => {
    expect(trendVerdict(price({ series90: line(44, 1_000, 1_100) }), 90, { raw: true }).enough).toBe(false);
    expect(trendVerdict(price({ series90: line(45, 1_000, 1_100) }), 90, { raw: true }).enough).toBe(true);
  });
  it('compares the last sale by whole UTC days, whatever the hour', () => {
    // 30 days before Nov 6 is Oct 7: in, from just after midnight to just before the next one.
    for (const t of ['2026-11-06T00:01:00Z', '2026-11-06T12:00:00Z', '2026-11-06T23:59:00Z']) {
      expect(trendVerdict(price({ lastSaleDay: '2026-10-07' }), 30, { now: Date.parse(t) }).enough).toBe(true);
      expect(trendVerdict(price({ lastSaleDay: '2026-10-06' }), 30, { now: Date.parse(t) }).enough).toBe(false);
    }
  });
});

describe('trendSentence', () => {
  const t = (o: object) => ({ direction: 'up' as const, change: 0.081, sales: 14, enough: true, ...o });
  it('colours only the percent, and leaves the window to the 30d/90d control', () => {
    const parts = trendSentence(t({ change: 0.21, sales: 62 }), 90);
    expect(text(parts)).toBe('Up 21% on 62 sales');
    expect(parts.filter((p) => p.tone !== 'secondary')).toEqual([{ text: '21%', tone: 'gain' }]);
    expect(text(trendSentence(t({ direction: 'down', change: -0.06, sales: 9 }), 90))).toBe('Down 6% on 9 sales');
    expect(text(trendSentence(t({ sales: 1 }), 30))).toBe('Up 8% on 1 sale');
    expect(trendSentence(t({ direction: 'down', change: -0.06 }), 90)[1].tone).toBe('loss');
  });
  it('flat and not-enough are all secondary', () => {
    expect(trendSentence(t({ direction: 'flat', change: 0.01 }), 30)).toEqual([{ text: 'Flat on 14 sales', tone: 'secondary' }]);
    expect(trendSentence(t({ enough: false }), 30)).toEqual([{ text: 'Too few sales for a trend', tone: 'secondary' }]);
  });
  it('raw names TCGplayer', () => {
    expect(text(trendSentence(t({ direction: 'down', change: -0.1, sales: 0 }), 30, true))).toBe('Down 10% on TCGplayer');
  });
  it('names the window where no control does (Before the table)', () => {
    expect(text(trendSentence(t({}), 30, false, { window: true }))).toBe('Up 8% in 30 days on 14 sales');
    expect(text(trendSentence(t({ direction: 'flat' }), 30, false, { window: true }))).toBe('Flat over 30 days on 14 sales');
    expect(text(trendSentence(t({ enough: false }), 30, false, { window: true }))).toBe('Too few sales for a trend');
  });
  it('stays short enough for one line at 375 wide', () => {
    // Longest realistic copy: 3-digit percent and sale count.
    const longest = [
      text(trendSentence(t({ direction: 'down', change: -0.999, sales: 999 }), 90)),
      text(trendSentence(t({ direction: 'down', change: -0.999, sales: 999 }), 30, false, { window: true })),
    ];
    expect(longest[0].length).toBeLessThanOrEqual(22);
    expect(longest[1].length).toBeLessThanOrEqual(36);
  });
});

describe('freshnessLine', () => {
  const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();
  it('fresh graded: updated time and last sale', () => {
    expect(freshnessLine(price({ refreshedAt: at(2), lastSaleDay: '2026-11-05' }), { now: NOW })).toBe('Updated 2h ago · Last sale Nov 5');
    expect(freshnessLine(price({ refreshedAt: at(0.5), lastSaleDay: '2026-11-05' }), { now: NOW })).toBe('Updated 30m ago · Last sale Nov 5');
  });
  it('stale past a day', () => {
    expect(freshnessLine(price({ refreshedAt: at(49), lastSaleDay: '2026-11-01' }), { now: NOW })).toBe('Updated 2 days ago · prices may be behind');
  });
  it('refreshing and failed', () => {
    expect(freshnessLine(price(), { state: 'refreshing', now: NOW })).toBe('Updating…');
    expect(freshnessLine(price({ asOf: '2026-11-04' }), { state: 'failed', now: NOW })).toBe("Couldn't update · showing prices from Nov 4");
  });
  it('no sale on record, and raw', () => {
    expect(freshnessLine(price({ refreshedAt: at(2), lastSaleDay: null }), { now: NOW })).toBe('Updated 2h ago · no sales on record');
    expect(freshnessLine(price({ refreshedAt: at(2), lastSaleDay: '2026-11-06' }), { raw: true, now: NOW })).toBe('Updated 2h ago');
  });
  it('falls back to the price_daily day when freshness is unknown', () => {
    expect(freshnessLine(price({ asOf: '2026-11-05' }), { now: NOW })).toBe('Updated yesterday');
    expect(freshnessLine(price({ asOf: '2026-11-06' }), { now: NOW })).toBe('Updated today');
    expect(freshnessLine(price({ asOf: '2026-11-03' }), { now: NOW })).toBe('Updated 3 days ago · prices may be behind');
  });
  it('Before the table shows it only when behind or failed, never while refreshing', () => {
    expect(freshnessWorthShowing(price({ refreshedAt: at(2) }), 'idle', NOW)).toBe(false);
    expect(freshnessWorthShowing(price({ refreshedAt: at(2) }), 'refreshing', NOW)).toBe(false);
    expect(freshnessWorthShowing(price({ refreshedAt: at(30) }), 'idle', NOW)).toBe(true);
    expect(freshnessWorthShowing(price({ refreshedAt: at(2) }), 'failed', NOW)).toBe(true);
  });
});

describe('conFreshnessLine', () => {
  const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();
  it('is quiet when every card is current', () => {
    expect(conFreshnessLine([price({ refreshedAt: at(2) }), price({ refreshedAt: at(5) })], { now: NOW })).toBeNull();
  });
  it('names the oldest card when behind or failed', () => {
    expect(conFreshnessLine([price({ refreshedAt: at(2) }), price({ refreshedAt: at(50) })], { now: NOW })).toBe('Prices updated 2 days ago · pull to refresh');
    expect(conFreshnessLine([price({ refreshedAt: at(2) })], { failed: true, now: NOW })).toBe('Prices updated 2h ago · pull to refresh');
  });
});
