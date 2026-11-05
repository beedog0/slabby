import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { cardKey } from '../cardKey';
import { filterStats, rowFor, soldSeries, summarize } from '../portfolio';
import { money, pct } from '../../lib/format';

const all = cards as Card[];
const byName = (n: string) => all.find((c) => c.name === n)!;

describe('cardKey', () => {
  it('builds grader:grade:set:number:lang', () => {
    expect(cardKey(byName('Mew ex'))).toBe('psa:10:SV2a:205:ja');
    expect(cardKey(byName('Pikachu ex SAR'))).toBe('raw::SSP:238:en');
  });
});

describe('rowFor', () => {
  it('matches the vault reference row (Mew ex $1,040, +60%)', () => {
    const r = rowFor(byName('Mew ex'), DEFAULT_RULES);
    expect(money(r.price!.marketCents)).toBe('$1,040');
    expect(pct(r.gain!)).toBe('+60%');
  });
  it('matches the con-mode reference row (Charizard ask 165 floor 130)', () => {
    const r = rowFor(byName('Charizard ex'), DEFAULT_RULES);
    expect([r.ask, r.floor]).toEqual([16_500, 13_000]);
  });
  it('respects per-card overrides', () => {
    const c = { ...byName('Charizard ex'), floorOverrideCents: 14_000 };
    expect(rowFor(c, DEFAULT_RULES).floor).toBe(14_000);
  });
});

describe('summarize', () => {
  it('only counts owned cards and sums floors of cards for sale', () => {
    const rows = all.map((c) => rowFor(c, DEFAULT_RULES));
    const s = summarize(rows);
    const owned = rows.reduce((t, r) => t + r.price!.marketCents, 0);
    expect(s.valueCents).toBe(owned);
    expect(s.forSaleCount).toBe(5);

    const sold = rows.map((r, i) => (i === 0 ? { ...r, card: { ...r.card, status: 'sold' as const } } : r));
    expect(summarize(sold).valueCents).toBe(owned - rows[0].price!.marketCents);
  });
});

describe('detailFor', () => {
  const { detailFor, rowFor } = require('../portfolio');
  const { DEFAULT_RULES } = require('../../types');
  const price = { marketCents: 104000, lowCents: 96000, highCents: 112000, sales30d: 6, asOf: '2026-11-05', series90: Array.from({ length: 91 }, (_, i) => 80000 + i * 266) };
  const card = { id: 'x', grader: 'psa', grade: 10, name: 'Mew ex', setName: '151', setCode: 'SV2a', number: '205', language: 'ja', paidCents: 65000, plan: 'hold', status: 'owned', askOverrideCents: null, floorOverrideCents: null };
  it('gives gain vs paid and the window', () => {
    const d = detailFor(rowFor(card, DEFAULT_RULES, price), 30);
    expect(d.gainCents).toBe(39000);
    expect(d.series).toHaveLength(31);
    expect(d.change).toBeGreaterThan(0);
  });
  it('is null without comps and has no gain without paid', () => {
    expect(detailFor(rowFor(card, DEFAULT_RULES, null), 90)).toBeNull();
    expect(detailFor(rowFor({ ...card, paidCents: null }, DEFAULT_RULES, price), 90).gainCents).toBeNull();
  });
});

describe('collection', () => {
  const { collection } = require('../portfolio');
  const mk = (id: string, plan: string, status: string, market: number | null, extra = {}) => ({
    card: { id, plan, status, soldCents: null, soldAt: null, ...extra },
    price: market == null ? null : { marketCents: market },
  });
  const rows = [
    mk('a', 'hold', 'owned', 100),
    mk('b', 'sell', 'owned', 300),
    mk('c', 'trade', 'owned', 200),
    mk('d', 'hold', 'sold', 50, { soldCents: 400, soldAt: '2026-11-01' }),
    mk('e', 'hold', 'sold', 50, { soldCents: 100, soldAt: '2026-11-03' }),
    mk('f', 'hold', 'owned', null),
  ];
  it('lists owned cards by value with a total', () => {
    const r = collection(rows, 'all');
    expect(r.rows.map((x: any) => x.card.id)).toEqual(['b', 'c', 'a', 'f']);
    expect(r.totalCents).toBe(600);
  });
  it('filters holds, for sale (incl. trade), and sold newest first', () => {
    expect(collection(rows, 'hold').rows.map((x: any) => x.card.id)).toEqual(['a', 'f']);
    expect(collection(rows, 'sell').rows.map((x: any) => x.card.id)).toEqual(['b', 'c']);
    const sold = collection(rows, 'sold');
    expect(sold.rows.map((x: any) => x.card.id)).toEqual(['e', 'd']);
    expect(sold.totalCents).toBe(500);
  });
});

import { collectionSeries, trendOf } from '../portfolio';

describe('collection value line', () => {
  const row = (series90: number[], status = 'owned') =>
    ({ card: { status }, price: { series90 } }) as unknown as Parameters<typeof collectionSeries>[0][number];

  it('sums owned cards by day, padding short histories with their first value', () => {
    expect(collectionSeries([row([100, 110, 120]), row([50, 60])])).toEqual([150, 160, 180]);
    expect(collectionSeries([row([100, 110]), row([999, 999], 'sold')])).toEqual([100, 110]);
  });

  it('reads the trend first to last', () => {
    expect(trendOf([1, 5, 2])).toBe('up');
    expect(trendOf([5, 1])).toBe('down');
    expect(trendOf([3])).toBe('flat');
  });
});

import { gridPrices } from '../../components/PriceChart';

describe('chart gridlines', () => {
  it('picks two round prices inside the range', () => {
    expect(gridPrices(118_000, 142_000)).toEqual([120_000, 140_000]);
    expect(gridPrices(5_000, 5_000)).toEqual([5_000]);
  });
});

describe('filterStats and soldSeries', () => {
  const sold = (id: string, soldCents: number, soldAt: string, paidCents: number | null = 10000): Card => ({
    ...byName('Mew ex'),
    id,
    status: 'sold',
    soldCents,
    soldAt,
    paidCents,
  });

  it('totals sales and profit for sold cards', () => {
    const rows = [sold('s1', 15000, '2026-11-01'), sold('s2', 5000, '2026-11-03', null)].map((c) =>
      rowFor(c, DEFAULT_RULES),
    );
    const s = filterStats(rows);
    expect(s.totalCents).toBe(20000);
    expect(s.profitCents).toBe(5000);
    expect(s.count).toBe(2);
  });

  it('builds a running total of sales by day', () => {
    const rows = [sold('a', 1000, '2026-10-01'), sold('b', 2000, '2026-11-03'), sold('c', 500, '2026-11-05')].map((c) =>
      rowFor(c, DEFAULT_RULES),
    );
    const s = soldSeries(rows, 4, new Date('2026-11-05T12:00:00Z'));
    expect(s).toEqual([1000, 1000, 3000, 3000, 3500]);
  });
});
