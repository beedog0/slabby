import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { rowFor } from '../portfolio';
import { profileStats, showcase } from '../profileStats';

const all = cards as Card[];
const rows = all.map((c) => rowFor(c, DEFAULT_RULES));

describe('profileStats', () => {
  const s = profileStats(rows, new Date('2026-11-09T12:00:00Z'));
  it('counts owned cards, graded and raw', () => {
    const owned = all.filter((c) => c.status === 'owned');
    expect(s.owned).toBe(owned.length);
    expect(s.graded + s.raw).toBe(owned.length);
    expect(s.graded).toBe(owned.filter((c) => c.grader !== 'raw').length);
  });
  it('picks the most valuable card as top and the biggest gain as best buy', () => {
    const owned = rows.filter((r) => r.card.status === 'owned' && r.price);
    const max = Math.max(...owned.map((r) => r.price!.marketCents));
    expect(s.top!.price!.marketCents).toBe(max);
    if (s.bestBuy) {
      for (const r of owned) if (r.card.paidCents != null) expect(r.price!.marketCents - r.card.paidCents).toBeLessThanOrEqual(s.bestBuy.gainCents);
    }
  });
  it('lists grades highest first and counts each card once', () => {
    const grades = s.grades.map(([g]) => g);
    expect(grades).toEqual([...grades].sort((a, b) => b - a));
    expect(s.grades.reduce((t, [, n]) => t + n, 0)).toBeLessThanOrEqual(s.graded);
  });
  it('adds up sales', () => {
    const sold = all.filter((c) => c.status === 'sold');
    expect(s.sold).toBe(sold.length);
    expect(s.soldCents).toBe(sold.reduce((t, c) => t + (c.soldCents ?? 0), 0));
  });
  it('is empty-safe', () => {
    const e = profileStats([]);
    expect([e.owned, e.valueCents, e.sets, e.top, e.bestBuy]).toEqual([0, 0, 0, null, null]);
  });
});

describe('showcase', () => {
  it('is owned cards by value, highest first', () => {
    const top = showcase(rows, 3);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].price!.marketCents).toBeGreaterThanOrEqual(top[i].price!.marketCents);
    expect(top.every((r) => r.card.status === 'owned')).toBe(true);
  });
});
