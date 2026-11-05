import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { cardKey } from '../cardKey';
import { rowFor, summarize } from '../portfolio';
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
