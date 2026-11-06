import { EMPTY_QUERY, facetsFrom, filterCount, findCards, findFacets, runnable, setId, sortFound, type Found } from '../searchFilters';

const q = (p: Partial<typeof EMPTY_QUERY>) => ({ ...EMPTY_QUERY, ...p });

describe('query helpers', () => {
  it('counts filters and knows when to run', () => {
    expect(filterCount(q({ language: 'ja', rarities: ['SAR', 'AR'] }))).toBe(3);
    expect(runnable(q({ q: 'u' }))).toBe(false);
    expect(runnable(q({ q: 'um' }))).toBe(true);
    expect(runnable(q({ set: { id: 1, name: 'S' } }))).toBe(true);
  });
  it('reads facet rows, biggest first', () => {
    const f = facetsFrom([
      { kind: 'set', key: '7', label: 'Seven', n: 2 },
      { kind: 'set', key: '9', label: 'Nine', n: 5 },
      { kind: 'rarity', key: 'SAR', label: 'SAR', n: 1 },
      { kind: 'language', key: 'ja', label: 'ja', n: 3 },
    ]);
    expect(f.sets.map((s) => s.id)).toEqual([9, 7]);
    expect(f.rarities).toEqual([{ key: 'SAR', n: 1 }]);
    expect(f.languages).toEqual([{ key: 'ja', n: 3 }]);
  });
  it('sorts by change and drops cards with no history', () => {
    const c = (productId: number, change7d: number | null) => ({ productId, change7d, change30d: null }) as unknown as Found;
    expect(sortFound([c(1, 0.1), c(2, null), c(3, 0.3), c(4, -0.2)], 'rise_7d').map((x) => x.productId)).toEqual([3, 1, 4]);
    expect(sortFound([c(1, 0.1), c(2, null), c(3, 0.3), c(4, -0.2)], 'drop_7d').map((x) => x.productId)).toEqual([4, 1, 3]);
  });
});

describe('mock search with filters', () => {
  it('searches all Japanese cards, not just the first page', async () => {
    const r = await findCards(q({ q: 'ex', language: 'ja' }));
    expect(r.map((c) => c.name)).toEqual(['Mew ex - 205/165']);
  });
  it('filters by rarity and browses a set without words', async () => {
    const sir = await findCards(q({ q: 'ex', rarities: ['Special Illustration Rare'] }));
    expect(sir.length).toBe(3);
    const evs = await findCards(q({ set: { id: setId('SWSH07: Evolving Skies'), name: 'SWSH07: Evolving Skies' } }));
    expect(evs.length).toBe(2);
  });
  it('offers the sets and rarities that match', async () => {
    const f = await findFacets(q({ q: 'umbreon' }));
    expect(f.sets[0]).toMatchObject({ name: 'SWSH07: Evolving Skies', n: 2 });
    expect(f.rarities.map((r) => r.key)).toContain('Secret Rare');
  });
});
