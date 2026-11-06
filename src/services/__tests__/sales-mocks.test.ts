// Without Supabase the sales screen runs on src/mocks/sales.json, in both shapes, and agrees with
// the price mocks Slab detail reads (scripts/gen-sales-mocks.js).

jest.mock('../supabase', () => ({ supabase: null }));

import cards from '../../mocks/cards.json';
import prices from '../../mocks/prices.json';
import { cardKey } from '../../pricing/cardKey';
import { salesCount, salesValues, summarize } from '../../pricing/sales';
import type { Card } from '../../types';
import { loadSales } from '../sales';

const all = cards as Card[];
const [mew, umbreon] = all;
const graded = all.filter((c) => c.grader !== 'raw');
type P = { marketCents: number; sales30d: number; sales90d?: number; asOf: string; lastSaleDay?: string };
const priceOf = (c: Card) => (prices as Record<string, P>)[cardKey(c)];

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

it.each(graded.map((c) => [c.name, c] as const))('%s agrees with its price mock', async (_n, card) => {
  const p = priceOf(card);
  const r30 = await loadSales(card, 30);
  const r90 = await loadSales(card, 90);
  expect(r30.kind).not.toBe('none');
  const newest = r30.kind === 'sales' ? r30.rows[0].soldDay : r30.kind === 'daily' ? r30.rows[0].day : null;
  expect(newest).toBe(p.lastSaleDay ?? p.asOf);
  expect(salesCount(r30)).toBe(p.sales30d);
  expect(salesCount(r90)).toBe(p.sales90d ?? p.sales30d);
  const median = summarize(salesValues(r30))!.medianCents;
  expect(Math.abs(median - p.marketCents) / p.marketCents).toBeLessThan(0.02);
});

it('raw cards have none', async () => {
  expect(await loadSales(all.find((c) => c.grader === 'raw')!, 90)).toEqual({ kind: 'none' });
});
