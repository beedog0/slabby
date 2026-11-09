import { chips, EMPTY_QUERY, toggle, withoutChip, facetsFrom, filterCount, findCards, findFacets, runnable, setId, sortFound, type Found } from '../searchFilters';

const q = (p: Partial<typeof EMPTY_QUERY>) => ({ ...EMPTY_QUERY, ...p });

describe('query helpers', () => {
  it('counts filters and knows when to run', () => {
    expect(filterCount(q({ languages: ['ja'], rarities: ['SAR', 'AR'] }))).toBe(3);
    expect(runnable(q({ q: 'u' }))).toBe(false);
    expect(runnable(q({ q: 'um' }))).toBe(true);
    expect(runnable(q({ sets: [{ id: 1, name: 'S' }] }))).toBe(true);
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
    const r = await findCards(q({ q: 'ex', languages: ['ja'] }));
    expect(r.map((c) => c.name)).toEqual(['Mew ex - 205/165']);
  });
  it('filters by rarity and browses a set without words', async () => {
    const sir = await findCards(q({ q: 'ex', rarities: ['Special Illustration Rare'] }));
    expect(sir.length).toBe(3);
    const evs = await findCards(q({ sets: [{ id: setId('SWSH07: Evolving Skies'), name: 'SWSH07: Evolving Skies' }] }));
    // The set's two singles and its booster box.
    expect(evs.length).toBe(3);
  });
  it('offers the sets and rarities that match', async () => {
    const f = await findFacets(q({ q: 'umbreon' }));
    expect(f.sets[0]).toMatchObject({ name: 'SWSH07: Evolving Skies', n: 2 });
    expect(f.rarities.map((r) => r.key)).toContain('Secret Rare');
  });
});

describe('multi-select', () => {
  it('ORs within a group and ANDs across groups', async () => {
    const both = await findCards(q({ q: 'ex', languages: ['ja', 'en'] }));
    expect(both.length).toBe(4);
    const sets = await findCards(q({ q: 'ex', sets: [{ id: 1, name: 'SV2a: Pokemon Card 151' }, { id: 2, name: 'SV08: Surging Sparks' }] }));
    expect(sets.map((c) => c.productId).sort()).toEqual([9000004, 9000005]);
    const andRarity = await findCards(q({ q: 'ex', sets: [{ id: 1, name: 'SV2a: Pokemon Card 151' }, { id: 2, name: 'SV08: Surging Sparks' }], rarities: ['Ultra Rare'] }));
    expect(andRarity.map((c) => c.productId)).toEqual([9000004]);
  });
  it('lists chips and removes one at a time', () => {
    const f = q({ languages: ['ja'], rarities: ['SAR'], sets: [{ id: 7, name: 'SV2a' }] });
    expect(chips(f).map((c) => c.label)).toEqual(['Japanese', 'SAR', 'SV2a']);
    expect(filterCount(withoutChip(f, chips(f)[2]))).toBe(2);
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('sealed product', () => {
  it('filters by type: cards, all sealed, one kind', async () => {
    const evs = { sets: [{ id: setId('SWSH07: Evolving Skies'), name: 'SWSH07: Evolving Skies' }] };
    expect((await findCards(q({ ...evs, types: ['card'] }))).map((c) => c.sealedType ?? null)).toEqual([null, null]);
    expect((await findCards(q({ ...evs, types: ['sealed'] }))).map((c) => c.name)).toEqual(['Evolving Skies Booster Box']);
    expect((await findCards(q({ q: 'box', types: ['etb'] }))).map((c) => c.productId)).toEqual([9100002]);
    expect((await findCards(q({ q: 'box', types: ['etb', 'booster_box'] }))).length).toBe(2);
  });
  it('offers Cards and each sealed kind as type facets, cards first', async () => {
    const f = await findFacets(q({ q: 'evolving' }));
    expect(f.types.map((t) => t.key)).toEqual(['card', 'booster_box']);
    expect(facetsFrom([{ kind: 'type', key: 'etb', label: 'etb', n: 1 }, { kind: 'type', key: 'card', label: 'card', n: 9 }, { kind: 'type', key: 'mystery', label: 'x', n: 1 }]).types).toEqual([
      { key: 'card', n: 9 },
      { key: 'etb', n: 1 },
    ]);
  });
  it('shows a type chip that removes', () => {
    const f = q({ types: ['booster_box'] });
    expect(chips(f).map((c) => c.label)).toEqual(['Booster box']);
    expect(filterCount(withoutChip(f, chips(f)[0]))).toBe(0);
  });
});

describe('art type', () => {
  it('filters by art type across games, OR within the group', async () => {
    const alt = await findCards(q({ q: 'umbreon', arts: ['alt_art'] }));
    expect(alt.map((c) => c.name).sort()).toEqual(['Umbreon V (Alternate Art)', 'Umbreon VMAX (Alternate Art Secret)']);
    const sir = await findCards(q({ q: 'ex', arts: ['special_illustration'] }));
    expect(sir.length).toBe(3);
    expect((await findCards(q({ q: 'ex', arts: ['special_illustration', 'secret'] }))).length).toBe(4);
    expect((await findCards(q({ q: 'luffy', arts: ['alt_art'] }))).length).toBe(1);
    expect((await findCards(q({ q: 'jinx', arts: ['alt_art'] }))).length).toBe(1);
  });
  it('never matches sealed product', async () => {
    const evs = q({ sets: [{ id: setId('SWSH07: Evolving Skies'), name: 'SWSH07: Evolving Skies' }] });
    expect((await findCards(q({ ...evs, arts: ['standard', 'alt_art', 'secret'] }))).every((c) => !c.sealedType)).toBe(true);
  });
  it('offers art facets in their fixed order, not by count', async () => {
    const f = await findFacets(q({ q: 'umbreon' }));
    expect(f.arts).toEqual([
      { key: 'alt_art', n: 2 },
      { key: 'special_illustration', n: 1 },
    ]);
    expect(facetsFrom([{ kind: 'art', key: 'promo', label: 'promo', n: 9 }, { kind: 'art', key: 'holo', label: 'holo', n: 1 }, { kind: 'art', key: 'shiny?', label: 'x', n: 1 }]).arts).toEqual([
      { key: 'holo', n: 1 },
      { key: 'promo', n: 9 },
    ]);
  });
  it('counts, chips and removes art types', () => {
    const f = q({ q: 'ex', arts: ['alt_art', 'secret'] });
    expect(filterCount(f)).toBe(2);
    expect(chips(f).map((c) => c.label)).toEqual(['Alt art', 'Secret and gold']);
    expect(withoutChip(f, chips(f)[0]).arts).toEqual(['secret']);
  });
});
