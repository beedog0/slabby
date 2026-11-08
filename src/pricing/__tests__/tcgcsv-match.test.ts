import { groupsFor, numberMatches, pickProduct } from '../../../supabase/functions/_shared/comps-math';


const prod = (productId: number, name: string, number: string) => ({ productId, name, extendedData: [{ name: 'Number', value: number }] });

describe('One Piece and Riftbound slab matching (TCGCSV)', () => {
  // Real One Piece groups, 2026-11-08: newer sets carry two codes or an event suffix.
  const op = [
    { groupId: 24579, name: "The Azure Sea's Seven Release Event Cards", abbreviation: 'OP14 RE' },
    { groupId: 24537, name: "The Azure Sea's Seven", abbreviation: 'OP14-EB04' },
    { groupId: 24305, name: 'Premium Booster -The Best- Vol. 2', abbreviation: 'PRB-02' },
    { groupId: 23000, name: 'Awakening of the New Era', abbreviation: 'OP05' },
  ];

  it('finds a set whose abbreviation holds two codes, main set before event cards', () => {
    expect(groupsFor(op, { setCode: 'OP14' }).map((g) => g.groupId)).toEqual([24537, 24579]);
    expect(groupsFor(op, { setCode: 'PRB02' }).map((g) => g.groupId)).toEqual([24305]);
    expect(groupsFor(op, { setCode: 'OP05' }).map((g) => g.groupId)).toEqual([23000]);
  });

  it("prefers the set's own card over another set's reprint with the same number", () => {
    const products = [prod(670642, 'Roronoa Zoro - PRB02-006 (SP)', 'PRB02-006'), prod(671353, 'Shachi & Penguin', 'OP14-006')];
    const c = { game: 'onepiece', name: 'Shachi & Penguin', number: '6', language: 'en', setCode: 'OP14', variety: null };
    expect(pickProduct(products, c)?.productId).toBe(671353);
  });

  it('matches Riftbound starred signature numbers and picks the signed printing', () => {
    expect(numberMatches('299*/298', '299')).toBe(true);
    expect(numberMatches('299*/298', '299*')).toBe(true);
    const kaisa = [
      prod(653045, "Kai'Sa, Daughter of the Void", '247/298'),
      prod(653093, "Kai'Sa, Daughter of the Void (Overnumbered)", '299/298'),
      prod(653094, "Kai'Sa, Daughter of the Void (Signature)", '299*/298'),
    ];
    const base = { game: 'riftbound', name: "Kai'sa - Daughter Of The Void", language: 'en', setCode: 'OGN' };
    expect(pickProduct(kaisa, { ...base, number: '299*', variety: 'SIGNATURE OVERNUMBER' })?.productId).toBe(653094);
    // OCR dropped the star: the variety still says signature.
    expect(pickProduct(kaisa, { ...base, number: '299', variety: 'SIGNATURE OVERNUMBER' })?.productId).toBe(653094);
    expect(pickProduct(kaisa, { ...base, number: '299', variety: 'OVERNUMBERED' })?.productId).toBe(653093);
    expect(pickProduct(kaisa, { ...base, number: '247', variety: null })?.productId).toBe(653045);
  });
});
