import { copiesOf, stackCopies } from '../arrange';
import { centsToDigits, digitsToCents, nextDigits, sharedPaid } from '../paid';
import type { CardRow } from '../portfolio';
import type { Card } from '../../types';

const base: Card = {
  id: 'a',
  certNumber: null,
  grader: 'raw',
  grade: null,
  name: 'Umbreon',
  setName: 'Evolving Skies',
  setCode: 'EVS',
  number: '215',
  language: 'en',
  year: 2021,
  imageFrontUrl: null,
  condition: 'near mint',
  paidCents: 1200,
  paidAt: null,
  plan: 'hold',
  floorOverrideCents: null,
  askOverrideCents: null,
  status: 'owned',
  soldCents: null,
  soldAt: null,
  soldWhere: null,
  createdAt: '2026-11-01T00:00:00Z',
};
const card = (p: Partial<Card>): Card => ({ ...base, ...p });

describe('copiesOf', () => {
  const a = card({ id: 'a' });
  const b = card({ id: 'b', paidCents: 1500 });
  const other = card({ id: 'c', number: '216' });
  const forSale = card({ id: 'd', plan: 'sell' });

  it('finds the raw singles that stack together, the tapped one first', () => {
    expect(copiesOf([other, b, a, forSale], a).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('matches what home stacks', () => {
    const rows = [a, b, other, forSale].map((c) => ({ card: c, price: null }) as unknown as CardRow);
    const stacked = stackCopies(rows);
    expect(stacked.find((r) => r.card.id === 'a')?.copies).toBe(copiesOf([a, b, other, forSale], a).length);
  });

  it('never stacks graded slabs', () => {
    const s1 = card({ id: 's1', grader: 'psa', grade: 10, certNumber: '1' });
    const s2 = card({ id: 's2', grader: 'psa', grade: 10, certNumber: '2' });
    expect(copiesOf([s1, s2], s1)).toEqual([s1]);
  });
});

describe('paid keypad', () => {
  it('replaces the starting price on the first key', () => {
    expect(nextDigits('12', '5', true)).toBe('5');
    expect(nextDigits('12', '5', false)).toBe('125');
    expect(nextDigits('0', '7', false)).toBe('7');
    expect(nextDigits('999999', '1', false)).toBe('999999');
  });

  it('treats 0 as paid nothing and blank as not typed', () => {
    expect(digitsToCents('0')).toBe(0);
    expect(digitsToCents('')).toBeNull();
    expect(digitsToCents('1301')).toBe(130100);
    expect(centsToDigits(250)).toBe('3');
    expect(centsToDigits(null)).toBe('');
  });

  it('knows when copies share one price', () => {
    expect(sharedPaid([{ paidCents: 100 }, { paidCents: 100 }])).toBe(100);
    expect(sharedPaid([{ paidCents: 100 }, { paidCents: 200 }])).toBeUndefined();
    expect(sharedPaid([{ paidCents: null }])).toBeNull();
  });
});
