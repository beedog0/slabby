import { DEFAULT_RULES } from '../../types';
import { askOverrideFor, checkAsk, checkFloor, discounted, minAsk, priceList, spreadTotal } from '../priceList';
import type { CardRow } from '../portfolio';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const row = (id: string, ask: number | null, floor: number | null, market: number | null, extra: Partial<CardRow['card']> = {}): CardRow =>
  ({
    card: { id, name: id, status: 'owned', plan: 'sell', paidCents: null, askOverrideCents: null, floorOverrideCents: null, ...extra },
    price: market == null ? null : { marketCents: market, lowCents: market },
    ask,
    floor,
  }) as unknown as CardRow;

describe('priceList', () => {
  it('lists cards for sale, biggest ask first, and totals them', () => {
    const l = priceList([
      row('a', 10_000, 8_000, 9_000),
      row('b', 30_000, 25_000, 28_000, { askOverrideCents: 30_000 }),
      row('hold', 5_000, 4_000, 5_000, { plan: 'hold' }),
      row('trade', 5_000, 4_000, 5_000, { plan: 'trade' }),
      row('sold', 5_000, 4_000, 5_000, { status: 'sold' }),
      row('new', null, null, null),
    ]);
    expect(l.items.map((i) => i.row.card.id)).toEqual(['b', 'a']);
    expect(l.unpriced.map((r) => r.card.id)).toEqual(['new']);
    expect(l).toMatchObject({ askCents: 40_000, floorCents: 33_000, marketCents: 37_000, overridden: 1 });
  });
});

describe('spreadTotal', () => {
  const items = [
    { askCents: 30_000, floorCents: 25_000 },
    { askCents: 15_000, floorCents: 10_000 },
    { askCents: 5_000, floorCents: 4_000 },
  ];

  it('hits the typed total exactly', () => {
    for (const t of [45_000, 47_300, 50_000, 61_234, 39_000]) expect(sum(spreadTotal(items, t, 500))).toBe(t);
  });

  it('spreads a cut in proportion to the asks', () => {
    // 10% off $500 = $450: $270 / $135 / $45.
    expect(spreadTotal(items, 45_000, 100)).toEqual([27_000, 13_500, 4_500]);
  });

  it('rounds each card to the rules step', () => {
    const out = spreadTotal(items, 46_000, 500);
    expect(sum(out)).toBe(46_000);
    expect(out.every((c) => c % 500 === 0)).toBe(true);
  });

  it('stops a card at its floor and lets the others carry it', () => {
    // 20% off $500 = $400. The $300 card would go to $240, under its $250 floor.
    const out = spreadTotal(items, 40_000, 100);
    expect(out[0]).toBe(25_000);
    expect(sum(out)).toBe(40_000);
    out.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(items[i].floorCents));
  });

  it('puts every card at its floor when the total is under the floors', () => {
    expect(spreadTotal(items, 10_000, 100)).toEqual([25_000, 10_000, 4_000]);
    expect(spreadTotal(items, 39_000, 100)).toEqual([25_000, 10_000, 4_000]);
  });

  it('raises asks too', () => {
    expect(spreadTotal(items, 55_000, 100)).toEqual([33_000, 16_500, 5_500]);
  });

  it('handles no cards', () => {
    expect(spreadTotal([], 10_000, 100)).toEqual([]);
  });
});

describe('discounted', () => {
  it('takes a percent off in whole dollars', () => {
    expect(discounted(48_750, 10)).toBe(43_900);
    expect(discounted(50_000, 5)).toBe(47_500);
  });
  it('rounds to the rules step so cards land on round prices', () => {
    expect(discounted(134_500, 10, 500)).toBe(121_000);
  });
});

describe('checks', () => {
  it('blocks an ask under what you paid when no-loss is on', () => {
    expect(checkAsk(9_000, 8_000, 10_000)).toEqual({ kind: 'underPaid', minCents: 10_000 });
  });
  it('says the floor comes down with an ask under it', () => {
    expect(checkAsk(7_000, 8_000, 0)).toEqual({ kind: 'floorDrops', floorCents: 7_000 });
    expect(checkAsk(9_000, 8_000, 0)).toEqual({ kind: 'ok' });
  });
  it('keeps a floor between paid and ask', () => {
    expect(checkFloor(9_000, 10_000, 9_500)).toEqual({ kind: 'underPaid', minCents: 9_500 });
    expect(checkFloor(11_000, 10_000, 0)).toEqual({ kind: 'overAsk', askCents: 10_000 });
    expect(checkFloor(9_000, 10_000, 0)).toEqual({ kind: 'ok' });
  });
  it('min ask is paid only with no-loss on', () => {
    const card = { paidCents: 5_000 } as CardRow['card'];
    expect(minAsk(card, { ...DEFAULT_RULES, neverBelowPaid: true })).toBe(5_000);
    expect(minAsk(card, { ...DEFAULT_RULES, neverBelowPaid: false })).toBe(0);
  });
});

describe('askOverrideFor', () => {
  it('stores nothing when the ask is what the rules would ask', () => {
    const rules = { ...DEFAULT_RULES, askPct: 10, roundToCents: 100 };
    const r = row('a', 11_000, 9_000, 10_000);
    expect(askOverrideFor(r.card, r, rules, 11_000)).toBeNull();
    expect(askOverrideFor(r.card, r, rules, 10_500)).toBe(10_500);
  });
});
