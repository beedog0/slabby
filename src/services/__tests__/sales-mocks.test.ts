// Without Supabase the sales screen runs on src/mocks/sales.json, in both shapes.

jest.mock('../supabase', () => ({ supabase: null }));

import cards from '../../mocks/cards.json';
import type { Card } from '../../types';
import { loadSales } from '../sales';

const [mew, umbreon, lugia] = cards as Card[];

it('mew has individual sales, 30 days inside 90', async () => {
  const r30 = await loadSales(mew, 30);
  const r90 = await loadSales(mew, 90);
  expect(r30.kind).toBe('sales');
  expect(r90.kind).toBe('sales');
  if (r30.kind !== 'sales' || r90.kind !== 'sales') return;
  expect(r30.rows.length).toBeGreaterThanOrEqual(5);
  expect(r90.rows.length).toBeGreaterThan(r30.rows.length);
  expect(r30.rows.every((s, i) => i === 0 || s.soldDay <= r30.rows[i - 1].soldDay)).toBe(true);
});

it('umbreon has daily averages', async () => {
  expect((await loadSales(umbreon, 30)).kind).toBe('daily');
});

it('other cards have none', async () => {
  expect(await loadSales(lugia, 90)).toEqual({ kind: 'none' });
});
