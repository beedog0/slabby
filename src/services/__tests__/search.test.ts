import { addParams, buyPrices, cardNumber, displayName, fold, nameAndVariant, nameTier, matches, openPrices, searchCards, terms } from '../search';

describe('search helpers', () => {
  it('splits numbers out of a search', () => {
    expect(terms('Umbreon #215/203')).toEqual(['umbreon', '215', '203']);
  });
  it('needs every word to match', () => {
    const c = { name: 'Umbreon VMAX (Alternate Art Secret)', setName: 'SWSH07: Evolving Skies', setCode: 'EVS', number: '215/203' };
    expect(matches(c, 'umbreon 215')).toBe(true);
    expect(matches(c, 'umbreon evs')).toBe(true);
    expect(matches(c, 'umbreon 189')).toBe(false);
    expect(matches(c, '   ')).toBe(false);
  });
  it('forgives apostrophes, accents and punctuation', () => {
    expect(fold("Kai'Sa")).toBe('kaisa');
    expect(fold('Kai’Sa')).toBe('kaisa');
    expect(fold('Flabébé')).toBe('flabebe');
    expect(fold('Ho-Oh')).toBe('ho oh');
    expect(fold('Monkey.D.Luffy')).toBe('monkey d luffy');
    expect(terms('OP05-119')).toEqual(['op05', '119']);
    const kaisa = { name: "Kai'Sa - Daughter of the Void", setName: 'Origins', setCode: 'OGN', number: 'OGN-029' };
    for (const q of ['Kai sa', 'kaisa', 'Kai’Sa', "kai'sa", 'KAISA ogn']) expect(matches(kaisa, q)).toBe(true);
    expect(matches({ name: 'Ho-Oh', setName: 'Neo Revelation', setCode: null, number: '7/64' }, 'hooh')).toBe(true);
    expect(matches({ name: 'Pikachu', setName: 'Pokémon GO', setCode: 'PGO', number: '1' }, 'pokemon go')).toBe(true);
    expect(matches(kaisa, 'kai su')).toBe(false);
    const scream = { name: 'Pikachu - 288/SM-P', setName: 'SM-P: Sun & Moon Promos', setCode: 'SM-P', number: '288/SM-P', aka: ['Scream Pikachu'] };
    expect(matches(scream, 'pikachu scream')).toBe(true);
    expect(matches(scream, 'screampikachu')).toBe(true);
    expect(matches({ ...scream, aka: [] }, 'scream')).toBe(false);
  });
  it('ranks the exact name first, then names that start with it', () => {
    expect(nameTier("Kai'Sa - Daughter of the Void", 'kai sa')).toBe(0);
    expect(nameTier('Kai’Sa, Daughter of the Void', 'kaisa')).toBe(0);
    expect(nameTier('Charizard - 4/102', 'charizard')).toBe(0);
    expect(nameTier('Mega Greninja ex - 116/086', 'greninja')).toBe(2);
    expect(nameTier('Umbreon VMAX (Alternate Art Secret)', 'umbreon vmax')).toBe(0);
    expect(nameTier('Charizard ex - 199/165', 'charizard')).toBe(1);
    expect(nameTier("Team Rocket's Mewtwo ex", 'mewtwo')).toBe(2);
    expect(nameTier('Mew ex - 205/165', 'mew 205')).toBe(3);
  });
  it('drops the printed number from TCGplayer titles only', () => {
    expect(displayName('Mew ex - 205/165')).toBe('Mew ex');
    expect(displayName('Jinx - Loose Cannon')).toBe('Jinx - Loose Cannon');
    expect(displayName('Snorunt - 046/217 (Love Ball)')).toBe('Snorunt (Love Ball)');
    expect(nameAndVariant('Snorunt - 046/217 (Energy Symbol Pattern)')).toEqual({ name: 'Snorunt', variant: 'Energy Symbol Pattern' });
    expect(nameAndVariant('Snorunt')).toEqual({ name: 'Snorunt', variant: null });
    expect(cardNumber('205/165')).toBe('205');
    expect(cardNumber('OP05-119')).toBe('OP05-119');
  });
});

describe('mock search', () => {
  it('finds cards and filters by game', async () => {
    expect((await searchCards('umbreon', null)).length).toBe(3);
    expect(await searchCards('umbreon', 'onepiece')).toEqual([]);
    expect(await searchCards('', null)).toEqual([]);
  });
  it('opens a Pokémon card with raw and PSA prices, another game with raw only', async () => {
    const p = await openPrices(9000001);
    expect(p?.grades.psa10?.marketCents).toBe(340000);
    expect(p?.raw?.marketCents).toBe(142000);
    const op = await openPrices(9000007);
    expect(op?.grades.psa10).toBeUndefined();
    expect(op?.raw?.marketCents).toBe(39000);
  });
  it('prefills Add to vault from the picked grade', async () => {
    const [c] = await searchCards('mew ex 205', null);
    expect(addParams(c, 'psa9')).toMatchObject({ name: 'Mew ex', number: '205', language: 'ja', grader: 'psa', grade: '9', setCode: 'SV2a', productId: '9000004' });
    expect(addParams(c, 'raw')).toMatchObject({ grader: 'raw', grade: '' });
    const [luffy] = await searchCards('luffy', null);
    expect(addParams(luffy, 'raw').game).toBe('onepiece');
  });
});

describe('buyPrices', () => {
  it('uses the buying rules and needs a price', () => {
    const { DEFAULT_RULES } = require('../../types');
    // Defaults: target −15%, max −5%, rounded to $5.
    expect(buyPrices(10000, DEFAULT_RULES)).toEqual({ target: 8500, max: 9500 });
    expect(buyPrices(null, DEFAULT_RULES)).toBeNull();
  });
});

import { firstLowGrade, gradeLabel, isQuiet, scaled, type SearchPrices } from '../search';
import { hasAllGrades, SEARCH_GRADES as SERVER_GRADES } from '../../../supabase/functions/_shared/catalog-math';

describe('grades 10 to 1', () => {
  const at = (asOf: string, cents = 1000) => ({ ...scaled(cents, 3), asOf });
  const base: SearchPrices = { raw: null, grades: {}, fetchedAt: '2026-11-06T10:00:00Z', source: 'ppt' };

  it('picks the highest lower grade that sold in the last 30 days', () => {
    expect(firstLowGrade({ ...base, grades: { psa7: at('2026-10-01'), psa6: at('2026-11-06') } })).toBe('psa6');
    expect(firstLowGrade({ ...base, grades: {} })).toBe('psa7');
  });

  it('calls a grade quiet when its newest daily row is older than the fetch', () => {
    expect(isQuiet(at('2026-11-06'), base.fetchedAt)).toBe(false);
    expect(isQuiet(at('2026-10-20'), base.fetchedAt)).toBe(true);
    expect(isQuiet(null, base.fetchedAt)).toBe(false);
  });

  it('labels grades', () => {
    expect(gradeLabel('psa1')).toBe('PSA 1');
    expect(gradeLabel('raw')).toBe('Raw');
  });

  it('refetches cached answers saved before low grades were kept', () => {
    expect(SERVER_GRADES).toHaveLength(10);
    expect(hasAllGrades({ grades: { psa10: null, psa9: null, psa8: null } })).toBe(false);
    expect(hasAllGrades({ grades: Object.fromEntries(SERVER_GRADES.map((g) => [g, null])) })).toBe(true);
  });
});
