import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { rowFor } from '../portfolio';
import { gradeMix, profileStats, recentActivity, spotlight } from '../profileStats';
import { underBy, wishView } from '../wishlistView';
import type { WishItem } from '../../store/wishlist';

const all = cards as Card[];
const rows = all.map((c) => rowFor(c, DEFAULT_RULES));

describe('recentActivity', () => {
  it('is newest first, capped, and only adds owned and sold', () => {
    const a = recentActivity(rows, 4);
    expect(a.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < a.length; i++) expect(Date.parse(a[i - 1].at)).toBeGreaterThanOrEqual(Date.parse(a[i].at));
    for (const x of a) expect(x.kind === 'sold' ? x.row.card.status === 'sold' : x.row.card.status === 'owned').toBe(true);
  });
  it('is empty-safe', () => expect(recentActivity([])).toEqual([]));
});

describe('gradeMix', () => {
  it('shares add up to 1 and empty bands are left out', () => {
    const m = gradeMix(rows);
    expect(m.reduce((t, b) => t + b.share, 0)).toBeCloseTo(1);
    for (const b of m) expect(b.n).toBeGreaterThan(0);
  });
  it('is empty-safe', () => expect(gradeMix([])).toEqual([]));
});

describe('spotlight', () => {
  it('prefers the best buy, else the top slab', () => {
    const s = profileStats(rows);
    const sp = spotlight(s);
    if (s.bestBuy) expect(sp!.row).toBe(s.bestBuy.row);
    else expect(sp!.row).toBe(s.top);
    expect(spotlight(profileStats([]))).toBeNull();
  });
});

const wish = (key: string, target: number, market: number | null): WishItem => ({
  key, productId: 1, grade: 'psa10', name: key, setName: 'S', number: null, imageUrl: null, game: 'pokemon',
  language: 'en', targetCents: target, autoTarget: false, marketCents: market, marketAsOf: null, addedAt: '2026-11-01',
});

describe('wishView', () => {
  const items = [wish('a', 1000, 1200), wish('b', 1000, 900), wish('c', 1000, 500), wish('d', 1000, null), wish('e', 1000, 1000)];
  const v = wishView(items);
  it('puts at-or-under first, biggest gap first', () => {
    expect(v.below.map((w) => w.key)).toEqual(['c', 'b', 'e']);
    expect(v.watching.map((w) => w.key)).toEqual(['a', 'd']);
  });
  it('totals at your prices', () => {
    expect(v.count).toBe(5);
    expect(v.totalCents).toBe(5000);
  });
  it('underBy is null above target or with no market', () => {
    expect(underBy(items[0])).toBeNull();
    expect(underBy(items[3])).toBeNull();
    expect(underBy(items[4])).toBe(0);
  });
});
