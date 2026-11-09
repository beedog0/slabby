import cards from '../../mocks/cards.json';
import type { CardRow } from '../../pricing/portfolio';
import type { Card } from '../../types';
import { asCard, buildShowcase, handleFromLink, orderShowcase, publicStats, toPublicCard, topGradeText } from '../publicProfile';

const row = (c: Partial<Card>, market: number | null): CardRow =>
  ({
    card: { ...(cards[0] as Card), ...c },
    price: market == null ? null : { marketCents: market },
    gain: null,
    trend30: 0,
    ask: null,
    floor: null,
    floorBasis: null,
    buyTarget: null,
    buyMax: null,
  }) as unknown as CardRow;

const rows = [
  row({ id: 'a', grade: 9, createdAt: '2025-01-01', setName: '151' }, 30000),
  row({ id: 'b', grade: 10, createdAt: '2025-03-01', setName: 'Evolving Skies' }, 10000),
  row({ id: 'c', grade: 10, createdAt: '2025-02-01', setName: '151' }, 50000),
  row({ id: 'd', grader: 'raw', grade: null, createdAt: '2025-04-01', setName: 'Base' }, 90000),
  row({ id: 'e', status: 'sold', soldCents: 999999, grade: 10 }, 200000),
];

const ids = (rs: { card: { id: string } }[]) => rs.map((r) => r.card.id);

test('orders by value, my order with the pin first, newest and best grade; sold cards never show', () => {
  expect(ids(orderShowcase(rows, { order: 'value', showValue: false }))).toEqual(['d', 'c', 'a', 'b']);
  expect(ids(orderShowcase(rows, { order: 'mine', showValue: false, shelfOrder: ['a', 'b', 'c', 'd'], pinnedId: 'c' }))).toEqual(['c', 'a', 'b', 'd']);
  expect(ids(orderShowcase(rows, { order: 'newest', showValue: false }))).toEqual(['d', 'b', 'c', 'a']);
  expect(ids(orderShowcase(rows, { order: 'grade', showValue: false }))).toEqual(['c', 'b', 'a', 'd']);
});

test('the pin only leads in my order', () => {
  expect(ids(orderShowcase(rows, { order: 'value', showValue: false, pinnedId: 'b' }))[0]).toBe('d');
});

test('public cards carry nothing private', () => {
  const p = toPublicCard(row({ id: 'x', certNumber: '12345678', paidCents: 500 }, 1000), false) as Record<string, unknown>;
  for (const k of ['certNumber', 'paidCents', 'paidAt', 'askOverrideCents', 'floorOverrideCents', 'soldCents', 'plan', 'valueCents']) {
    expect(k in p).toBe(false);
  }
  expect(toPublicCard(row({ id: 'x' }, 1000), true).valueCents).toBe(1000);
  expect(asCard(p as never).certNumber).toBeNull();
});

test('stats: owned only, top grade count, value only when shown', () => {
  const s = publicStats(rows, false);
  expect(s).toMatchObject({ owned: 4, graded: 3, topGrade: 10, topGradeCount: 2, sets: 3, valueCents: null });
  expect(publicStats(rows, true).valueCents).toBe(180000);
  expect(topGradeText(s)).toBe('2× 10');
  expect(buildShowcase(rows, { order: 'value', showValue: false, max: 2 }).cards.map((c) => c.id)).toEqual(['d', 'c']);
});

test('reads a handle from a profile link or @handle', () => {
  expect(handleFromLink('slabby://u/bryan.n')).toBe('bryan.n');
  expect(handleFromLink('https://slabby.app/u/Bryan')).toBe('bryan');
  expect(handleFromLink('@bryan')).toBe('bryan');
  expect(handleFromLink('https://www.psacard.com/cert/12345678')).toBeNull();
});
