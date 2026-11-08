import { dealsByCard } from '../deals';
import { maxShare, splitDeal } from '../split';
import type { Card } from '../../types';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id, certNumber: null, grader: 'psa', grade: 10, name: id, setName: null, setCode: null, number: null,
  language: 'en', year: null, imageFrontUrl: null, paidCents: null, paidAt: null, plan: 'sell',
  floorOverrideCents: null, askOverrideCents: null, status: 'owned', soldCents: null, soldAt: null,
  soldWhere: null, createdAt: '2026-01-01T00:00:00Z', ...over,
});

describe('splitDeal', () => {
  it('splits a whole-dollar total into whole dollars by market', () => {
    const s = splitDeal(45_000, [10_000, 20_000, 30_000]);
    expect(s).toEqual([7_500, 15_000, 22_500]);
    const odd = splitDeal(10_000, [1, 1, 1]);
    expect(odd.every((c) => c % 100 === 0)).toBe(true);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(10_000);
  });
  it('gives the rest to the cards you did not set', () => {
    expect(splitDeal(45_000, [10_000, 20_000, 30_000], [20_000, null, null])).toEqual([20_000, 10_000, 15_000]);
  });
  it('keeps typed shares when every card is set, even if they no longer add up', () => {
    expect(splitDeal(45_000, [1, 1], [10_000, 20_000])).toEqual([10_000, 20_000]);
  });
  it('never goes negative when the set shares eat the total', () => {
    expect(splitDeal(10_000, [1, 1, 1], [10_000, null, null])).toEqual([10_000, 0, 0]);
  });
  it('caps one share at what the other set shares leave', () => {
    expect(maxShare(45_000, [20_000, null, 5_000], 1)).toBe(20_000);
    expect(maxShare(45_000, [20_000, null, 5_000], 0)).toBe(40_000);
  });
});

describe('dealsByCard', () => {
  const at = '2026-11-08T04:00:00.123Z';
  it('groups cards sold at the same moment and place', () => {
    const cards = [
      card('a', { status: 'sold', soldAt: at, soldWhere: 'Collect-A-Con', soldCents: 15_000 }),
      card('b', { status: 'sold', soldAt: '2026-11-08T04:00:00.123+00:00', soldWhere: 'Collect-A-Con', soldCents: 30_000 }),
      card('c', { status: 'sold', soldAt: at, soldWhere: null, soldCents: 5_000 }),
      card('d', { status: 'sold', soldAt: '2026-11-08T05:00:00Z', soldWhere: 'Collect-A-Con', soldCents: 1 }),
      card('e'),
    ];
    const m = dealsByCard(cards);
    expect(m.get('a')?.ids).toEqual(['a', 'b']);
    expect(m.get('b')?.totalCents).toBe(45_000);
    expect(m.has('c')).toBe(false);
    expect(m.has('d')).toBe(false);
    expect(m.has('e')).toBe(false);
  });
  it('has no total when the deal was saved without a price', () => {
    const cards = [card('a', { status: 'sold', soldAt: at }), card('b', { status: 'sold', soldAt: at })];
    expect(dealsByCard(cards).get('a')?.totalCents).toBeNull();
  });
});

describe('splitDeal with unpriced cards', () => {
  it('treats a card with no market as an average card', () => {
    expect(splitDeal(30_000, [20_000, null])).toEqual([15_000, 15_000]);
  });
});
