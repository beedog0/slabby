import { mergeField, mergeSaved, mergeState } from '../backup';
import { savedAgo } from '../../lib/format';

describe('account merge', () => {
  it('joins lists by id, the account first, and keeps the phone-only items', () => {
    const remote = [{ id: 'a', name: 'Account copy' }, { id: 'b' }];
    const local = [{ id: 'a', name: 'Phone copy' }, { id: 'c' }];
    expect(mergeField(remote, local)).toEqual([{ id: 'a', name: 'Account copy' }, { id: 'b' }, { id: 'c' }]);
  });

  it('joins wishlist items by key', () => {
    const merged = mergeField([{ key: '1:psa10' }], [{ key: '1:psa10' }, { key: '2:raw' }]) as { key: string }[];
    expect(merged.map((i) => i.key)).toEqual(['1:psa10', '2:raw']);
  });

  it('joins id lists (shelf order, removed ids) without repeats', () => {
    expect(mergeField(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('joins maps with the account winning (scan corrections)', () => {
    expect(mergeField({ x: 1, y: 2 }, { y: 9, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('never lets an empty side wipe the other', () => {
    expect(mergeField([], [{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(mergeField([{ id: 'a' }], [])).toEqual([{ id: 'a' }]);
    expect(mergeField(null, { id: 'con-1' })).toEqual({ id: 'con-1' });
    expect(mergeField({}, { k: 1 })).toEqual({ k: 1 });
  });

  it('takes the account for plain settings', () => {
    expect(mergeField('dark', 'system')).toBe('dark');
    expect(mergeField(null, 'shelf')).toBe('shelf');
  });

  it('keeps a removed card removed, on either side', () => {
    const merged = mergeState(
      { cards: [{ id: 'a' }, { id: 'b' }], removedIds: [] },
      { cards: [{ id: 'c' }], removedIds: ['b'] },
    ) as { cards: { id: string }[] };
    expect(merged.cards.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('a fresh phone takes the account whole', () => {
    const remote = { state: { cards: [{ id: 'a' }], removedIds: [] }, version: 2 };
    expect(mergeSaved(remote, null)).toEqual(remote);
    expect(mergeSaved(remote, { state: { cards: [], removedIds: [] }, version: 2 })).toEqual(remote);
  });

  it('keeps this build’s version', () => {
    expect(mergeSaved({ state: {}, version: 3 }, { state: {}, version: 2 })?.version).toBe(2);
  });
});

describe('savedAgo', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  it('reads like a person', () => {
    expect(savedAgo(null, now)).toBeNull();
    expect(savedAgo('2026-11-08T11:59:40Z', now)).toBe('just now');
    expect(savedAgo('2026-11-08T11:56:00Z', now)).toBe('4 min ago');
    expect(savedAgo('2026-11-08T09:00:00Z', now)).toBe('3 hr ago');
    expect(savedAgo('2026-11-06T09:00:00Z', now)).toBe('Nov 6');
  });
});
