import { addParams, buyPrices, cardNumber, displayName, nameAndVariant, matches, openPrices, searchCards, terms } from '../search';

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
