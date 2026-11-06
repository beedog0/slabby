import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { arrange, matches, swapOrder } from '../arrange';
import { rowFor } from '../portfolio';

const rows = (cards as Card[]).filter((c) => c.status === 'owned').map((c) => rowFor(c, DEFAULT_RULES));
const ids = (rs: { card: Card }[]) => rs.map((r) => r.card.id);

describe('search', () => {
  it('matches every word against name, set and grade', () => {
    const mew = rows.find((r) => r.card.name === 'Mew ex')!;
    expect(matches(mew, 'mew 151')).toBe(true);
    expect(matches(mew, 'psa 10')).toBe(true);
    expect(matches(mew, '#205')).toBe(true);
    expect(matches(mew, 'mew charizard')).toBe(false);
  });
  it('narrows the list', () => {
    expect(arrange(rows, { sort: 'value', query: 'umbreon' }).every((r) => /umbreon/i.test(r.card.name))).toBe(true);
  });
});

describe('sort', () => {
  it('sorts by value high to low', () => {
    const v = arrange(rows, { sort: 'value' }).map((r) => r.price?.marketCents ?? 0);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
  it('sorts by name', () => {
    const n = arrange(rows, { sort: 'name' }).map((r) => r.card.name);
    expect(n[0] <= n[n.length - 1]).toBe(true);
  });
  it('puts the pinned card first in any sort', () => {
    const last = arrange(rows, { sort: 'value' }).at(-1)!.card.id;
    expect(arrange(rows, { sort: 'value', pinnedId: last })[0].card.id).toBe(last);
    expect(arrange(rows, { sort: 'name', pinnedId: last })[0].card.id).toBe(last);
  });
  it('follows my order, unknown cards after', () => {
    const [a, b] = ids(rows).slice(-2);
    const out = ids(arrange(rows, { sort: 'mine', order: [b, a] }));
    expect(out.slice(0, 2)).toEqual([b, a]);
    expect(out).toHaveLength(rows.length);
  });
});

describe('swapOrder', () => {
  it('swaps two cards and keeps everything else in place', () => {
    expect(swapOrder([], ['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['c', 'b', 'a', 'd']);
  });
  it('keeps hidden cards from the old order at the end', () => {
    expect(swapOrder(['x', 'a', 'b'], ['a', 'b'], 'a', 'b')).toEqual(['b', 'a', 'x']);
  });
});
