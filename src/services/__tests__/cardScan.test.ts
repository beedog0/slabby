import { cardSteadyKey, findScannedCard, isConfident, looksLikeSlab, numberVariants, parseCardText, printOptions, rankCards } from '../cardScan';
import type { CatalogCard } from '../search';

jest.mock('../supabase', () => ({ supabase: null }));

const card = (o: Partial<CatalogCard>): CatalogCard => ({
  productId: 1,
  game: 'pokemon',
  language: 'en',
  name: 'Card',
  number: null,
  rarity: null,
  setName: 'Set',
  setCode: null,
  imageUrl: null,
  marketCents: null,
  lowCents: null,
  ...o,
});

describe('parseCardText', () => {
  it('reads a modern English bottom line', () => {
    const p = parseCardText(['Charizard ex', 'HP 330', 'Illus. Mitsuhiro Arita', 'G MEW EN 199/165 ★'])!;
    expect(p.numbers[0]).toEqual({ num: '199', total: '165' });
    expect(p.codes).toContain('MEW');
    expect(p.language).toBe('en');
    expect(p.words.has('CHARIZARD')).toBe(true);
  });

  it('reads a Japanese set code without a name', () => {
    const p = parseCardText(['ミュウex', 'SV2a 205/165 UR'])!;
    expect(p.numbers[0]).toEqual({ num: '205', total: '165' });
    expect(p.codes).toContain('SV2A');
    expect(p.language).toBe('ja');
  });

  it('fixes O and l misread inside numbers, and spaces around the slash', () => {
    const p = parseCardText(['Pikachu', '238 / l9l'])!;
    expect(p.numbers[0]).toEqual({ num: '238', total: '191' });
    expect(parseCardText(['O25/198'])!.numbers[0]).toEqual({ num: '025', total: '198' });
  });

  it('reads trainer gallery, One Piece and promo numbers', () => {
    expect(parseCardText(['TG05/TG30'])!.numbers[0]).toEqual({ num: 'TG05', total: 'TG30' });
    expect(parseCardText(['OP05-119 SEC'])!.numbers[0]).toEqual({ num: 'OP05-119', total: null });
    expect(parseCardText(['SWSH123'])!.numbers[0]).toEqual({ num: 'SWSH123', total: null });
  });

  it('is null without a collector number', () => {
    expect(parseCardText(['Charizard', 'HP 120', 'Fire Spin 100'])).toBeNull();
  });
});

describe('looksLikeSlab', () => {
  it('spots a grader label', () => {
    expect(looksLikeSlab(['2023 POKEMON MEW EN #199', 'CHARIZARD ex', 'GEM MT 10', '81234560'])).toBe(true);
    expect(looksLikeSlab(['Charizard ex', 'MEW EN 199/165'])).toBe(false);
  });
});

describe('numberVariants', () => {
  it('covers zero padding both ways', () => {
    expect(numberVariants({ num: '25', total: '198' })).toEqual(expect.arrayContaining(['25/198', '025/198']));
    expect(numberVariants({ num: '025', total: '198' })).toEqual(expect.arrayContaining(['25/198', '025/198']));
    expect(numberVariants({ num: '4', total: '102' })).toEqual(expect.arrayContaining(['4/102', '004/102']));
  });
});

describe('cardSteadyKey', () => {
  it('ignores leading zeros so two reads agree', () => {
    expect(cardSteadyKey(parseCardText(['025/198']))).toBe(cardSteadyKey(parseCardText(['25/198'])));
  });
});

describe('rankCards', () => {
  const p = parseCardText(['Charizard ex', 'MEW EN 199/165'])!;
  it('puts the set code and name match first', () => {
    const ranked = rankCards(
      [
        card({ productId: 2, name: 'Alakazam ex - 199/165', number: '199/165', setCode: 'XXX', language: 'en' }),
        card({ productId: 3, name: 'Charizard ex - 199/165', number: '199/165', setCode: 'MEW', language: 'en' }),
      ],
      p,
    );
    expect(ranked[0].card.productId).toBe(3);
    expect(isConfident(ranked)).toBe(true);
  });

  it('is not confident when two cards tie', () => {
    const q = parseCardText(['4/102'])!;
    const ranked = rankCards(
      [card({ productId: 4, number: '4/102', name: 'Charizard' }), card({ productId: 5, number: '4/102', name: 'Charizard' })],
      q,
    );
    expect(isConfident(ranked)).toBe(false);
  });
});

describe('findScannedCard (mocks)', () => {
  it('finds the Japanese Mew ex from number and set code', async () => {
    const r = await findScannedCard(parseCardText(['SV2a 205/165'])!);
    expect(r[0].card.name).toMatch(/Mew ex/);
  });
});

describe('printOptions', () => {
  it('offers the catalog printings, base first', () => {
    const c = card({ printings: [{ name: 'Holofoil', marketCents: 425, lowCents: 300 }, { name: 'Reverse Holofoil', marketCents: 950, lowCents: 800 }] });
    expect(printOptions(c).map((x) => x.name)).toEqual(['Holofoil', 'Reverse Holofoil']);
  });
  it('falls back to the usual Pokémon prints before the catalog has them', () => {
    expect(printOptions(card({})).map((x) => x.name)).toContain('Reverse Holofoil');
    expect(printOptions(card({ game: 'onepiece' }))).toEqual([]);
  });
});
