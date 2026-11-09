import type { CardRow } from '../../pricing/portfolio';
import type { WishItem } from '../../store/wishlist';
import type { Card } from '../../types';
import { pickedRows, profileImageCards, statsLine, wishCaption, wishCard, wishPicks } from '../shareImage';

const row = (id: string, market: number, extra: Partial<Card> = {}): CardRow =>
  ({ card: { id, name: id, status: 'owned', grader: 'psa', grade: 10, setName: 's', createdAt: '2025-01-01', certNumber: '123', paidCents: 5, ...extra }, price: { marketCents: market } }) as unknown as CardRow;

const rows = [row('a', 100), row('b', 300), row('c', 200), row('d', 50, { status: 'sold' })];

test('custom keeps your order and drops cards no longer owned', () => {
  expect(pickedRows(rows, ['c', 'zz', 'a', 'd']).map((r) => r.card.id)).toEqual(['c', 'a']);
  const cards = profileImageCards(rows, { order: 'custom', customIds: ['c', 'a'], count: 1, showValue: false });
  expect(cards.map((c) => c.id)).toEqual(['c', 'a']);
  expect(cards[0].certNumber).toBeNull();
  expect(cards[0].paidCents).toBeNull();
});

test('ordered modes take per-row × shelves cards', () => {
  expect(profileImageCards(rows, { order: 'value', customIds: [], count: 2, showValue: false }).map((c) => c.id)).toEqual(['b', 'c']);
});

test('stats line reads plainly', () => {
  expect(statsLine({ owned: 8, graded: 7, topGrade: 6, topGradeCount: 1, sets: 6, valueCents: null })).toBe('8 slabs · best grade 6 · 6 sets');
  expect(statsLine({ owned: 38, graded: 30, topGrade: 10, topGradeCount: 14, sets: 19, valueCents: 100 })).toBe('$1 · 38 slabs · 14 graded 10 · 19 sets');
});

const wish = (key: string, grade: WishItem['grade']): WishItem => ({
  key, productId: 1, grade, name: key, setName: 'S', number: '1', imageUrl: null, game: 'pokemon', language: 'en',
  targetCents: 42000, autoTarget: false, marketCents: null, marketAsOf: null, addedAt: '2025-01-01',
});

test('wishlist cards, picks and captions', () => {
  expect(wishCard(wish('x', 'psa9'))).toMatchObject({ grader: 'psa', grade: 9 });
  expect(wishCard(wish('x', 'raw'))).toMatchObject({ grader: 'raw', grade: null });
  const items = [wish('a', 'psa10'), wish('b', 'raw')];
  expect(wishPicks(items, []).map((w) => w.key)).toEqual(['a', 'b']);
  expect(wishPicks(items, ['b', 'gone']).map((w) => w.key)).toEqual(['b']);
  expect(wishCaption(items[0], 'buying', true)).toBe('PSA 10\nPaying $420');
  expect(wishCaption(items[1], 'wishlist', false)).toBe('Raw');
});
