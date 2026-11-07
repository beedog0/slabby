import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { arrange, dropOrder, matches, moveTo, slotAt, stackCopies, swapOrder } from '../arrange';
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

describe('drag to arrange', () => {
  it('moves one slab and keeps the rest in order', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b'], 'a', 9)).toEqual(['b', 'a']);
  });
  it('saves the dropped order with hidden slabs after it', () => {
    expect(dropOrder(['a', 'x', 'b', 'y'], ['b', 'a'])).toEqual(['b', 'a', 'x', 'y']);
  });
  it('finds the slot under a point', () => {
    const g = { cols: 3, inset: 12, step: 110, pitch: 220, count: 7 };
    expect(slotAt(0, 0, g)).toBe(0);
    expect(slotAt(130, 10, g)).toBe(1);
    expect(slotAt(400, 10, g)).toBe(2);
    expect(slotAt(20, 230, g)).toBe(3);
    expect(slotAt(400, 900, g)).toBe(6); // past the end lands on the last slot
  });
});

describe('stackCopies', () => {
  const raw = rows.find((r) => r.card.grader === 'raw')!;
  const graded = rows.find((r) => r.card.grader !== 'raw')!;
  const copy = (r: typeof raw, id: string, patch = {}) => ({ ...r, card: { ...r.card, id, ...patch } });

  it('shows identical raw singles once, with a count, in the first one\'s place', () => {
    const out = stackCopies([raw, graded, copy(raw, 'b'), copy(raw, 'c')]);
    expect(ids(out)).toEqual([raw.card.id, graded.card.id]);
    expect(out[0].copies).toBe(3);
  });
  it('keeps different conditions or plans apart, and never stacks graded slabs', () => {
    const out = stackCopies([raw, copy(raw, 'b', { condition: 'LP' }), copy(raw, 'c', { plan: 'hold' }), graded, copy(graded, 'g2')]);
    expect(out).toHaveLength(5);
    expect(out.every((r) => (r.copies ?? 1) === 1)).toBe(true);
  });
});
