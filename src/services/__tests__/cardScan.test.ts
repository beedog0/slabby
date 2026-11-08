import { cardSteadyKey, correctionKey, findScannedCard, findSimilarCards, searchName, similarForSlab, withCorrection, fitsRead, rankSimilar, readName, isConfident, looksLikeSlab, missReason, numberVariants, parseCardText, printedNumber, printName, printOptions, rankCards } from '../cardScan';
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

describe('likely print before the catalog lists prints', () => {
  it('leads with Holofoil for illustration rares and Normal for commons, priced at the catalog market', () => {
    const sir = printOptions(card({ rarity: 'Special Illustration Rare', marketCents: 800 }));
    expect(sir[0]).toEqual({ name: 'Holofoil', marketCents: 800 });
    expect(sir[1].marketCents).toBeNull();
    expect(printOptions(card({ rarity: 'Common' }))[0].name).toBe('Normal');
  });
  it('names prints in plain words', () => {
    expect(['Holofoil', 'Reverse Holofoil', '1st Edition Holofoil', 'Normal'].map(printName)).toEqual(['Holo', 'Reverse holo', '1st Edition holo', 'Normal']);
  });
});

// How card numbers are printed, one test per format. The catalog column says how TCGplayer
// stores the same card (via TCGCSV), which is what the number must match.
//
// | Printed on the card              | Era / where                        | TCGplayer number |
// | G MEW EN 199/165                 | SV main sets (EN + set code)       | 199/165          |
// | 025/202 (set symbol only)        | SWSH main sets                     | 025/202          |
// | 4/102                            | WotC to SM, no set code            | 4/102            |
// | SV2a 205/165 UR                  | Japanese main sets                 | 205/165          |
// | TG05/TG30, GG19/GG70             | Trainer / Galarian Gallery         | TG05/TG30        |
// | SV001/SV122, SV1/SV94            | Shining / Hidden Fates Shiny Vault | SV001/SV122      |
// | RC1/RC32, H1/H32                 | Radiant Collection, e-Card holos   | RC1/RC32         |
// | J MEP EN 049 ★                   | Mega Evolution promos (incl. 30th) | 049 (set MEP)    |
// | G SVP EN 049 ★                   | Scarlet & Violet promos            | 049 (set SVP)    |
// | SWSH123, SM100, XY67, BW04, HGSS01, DP45 | Older black star promos    | SWSH123, SM100…  |
// | 001/SV-P, 123/S-P, 401/SM-P, 001/M-P | Japanese promos                | 001/SV-P         |
// | SVPEN 197, #094 · MEP EN         | Same promos, OCR glued or reordered| 197 (set SVP)    |
// | J 30C EN 023/128                 | 30th Celebration set (2026)        | 023/128          |
// | 013/30th-P                       | Japanese 30th anniversary promos   | 013/30th-P       |
// | D S1W 037/067C                   | Japanese, rarity glued to number   | 037/067          |
// | CSV1C 001/151, AC2b …            | Simplified / Traditional Chinese   | not on TCGplayer |
// | Japanese layout + Hangul / KOR   | Korean prints                      | not on TCGplayer |
// | OP05-119, ST01-012, OGN-301      | One Piece, Riftbound               | OP05-119         |
// Wizards and Nintendo promos print a bare number ("6", "022") with no code; too ambiguous to
// read alone, so they go through search.
describe('card number formats', () => {
  const first = (t: (string | { text: string; x: number; y: number })[]) => parseCardText(t)?.numbers[0];

  it('Scarlet & Violet main set: regulation mark, set code, EN, number/total', () => {
    const p = parseCardText(['H TWM EN 167/167 ★'])!;
    expect(p.numbers[0]).toEqual({ num: '167', total: '167' });
    expect(p.codes).toContain('TWM');
    expect(p.language).toBe('en');
  });

  it('Sword & Shield and older main sets: number/total only', () => {
    expect(first(['E 025/202'])).toEqual({ num: '025', total: '202' });
    expect(first(['4/102'])).toEqual({ num: '4', total: '102' });
  });

  it('Japanese main set with a lower-case set letter', () => {
    const p = parseCardText(['SV4a 349/190 SAR'])!;
    expect(p.numbers[0]).toEqual({ num: '349', total: '190' });
    expect(p.language).toBe('ja');
  });

  it('gallery and vault subsets', () => {
    expect(first(['GG19/GG70'])).toEqual({ num: 'GG19', total: 'GG70' });
    expect(first(['SV001/SV122'])).toEqual({ num: 'SV001', total: 'SV122' });
    expect(first(['SV1/SV94'])).toEqual({ num: 'SV1', total: 'SV94' });
    expect(first(['RC1/RC32'])).toEqual({ num: 'RC1', total: 'RC32' });
    expect(first(['H1/H32'])).toEqual({ num: 'H1', total: 'H32' });
  });

  it('Mega Evolution promo, as read from Bryan’s Snivy (EN misread as “IN)”)', () => {
    const p = parseCardText(['Snivy', 'нр60X', 'Vine Whip', 'J MEP IN) 049'])!;
    expect(p.numbers[0]).toEqual({ num: '049', total: null, code: 'MEP' });
    expect(p.codes).toContain('MEP');
    expect(p.language).toBe('en');
    expect(printedNumber(p.numbers[0])).toBe('MEP 049');
  });

  it('Mega Evolution promo split into pieces on the bottom line (Oshawott)', () => {
    const p = parseCardText([
      { text: 'BASIC', x: 0.05, y: 0.04 },
      { text: 'Oshawott', x: 0.2, y: 0.05 },
      { text: 'Flip a coin If heads, this attack does 30 more damage', x: 0.1, y: 0.5 },
      { text: 'J', x: 0.05, y: 0.9 },
      { text: 'MEP EN', x: 0.08, y: 0.901 },
      { text: '051 ★', x: 0.15, y: 0.899 },
    ])!;
    expect(p.numbers[0]).toEqual({ num: '051', total: null, code: 'MEP' });
    expect(p.words.has('OSHAWOTT')).toBe(true);
  });

  it('Scarlet & Violet promo, including code and language glued together', () => {
    expect(first(['G SVP EN 049 ★'])).toEqual({ num: '049', total: null, code: 'SVP' });
    expect(first(['H SVPEN 197'])).toEqual({ num: '197', total: null, code: 'SVP' });
    expect(first(['#094 · MEP EN'])).toEqual({ num: '094', total: null, code: 'MEP' });
  });

  it('30th Celebration set and its Japanese promos', () => {
    const p = parseCardText(['J 30C EN 023/128'])!;
    expect(p.numbers[0]).toEqual({ num: '023', total: '128' });
    expect(p.codes).toContain('30C');
    expect(first(['013/30th-P'])).toEqual({ num: '013', total: '30TH-P' });
    expect(numberVariants({ num: '013', total: '30TH-P' })).toContain('013/30th-P');
  });

  it('Japanese rarity letters glued to the number', () => {
    expect(first(['D S1W 037/067C'])).toEqual({ num: '037', total: '067' });
  });

  it('Chinese set codes', () => {
    const p = parseCardText(['CSV1C 001/151'])!;
    expect(p.language).toBe('zh');
    expect(p.codes).toContain('CSV1C');
  });

  it('Korean text on a Japanese-style line', () => {
    expect(parseCardText(['피카츄', 'SV2a 025/165'])!.language).toBe('ko');
  });

  it('older black star promos with the code fused to the number', () => {
    for (const n of ['SWSH123', 'SM100', 'XY67', 'BW04', 'HGSS01', 'DP45']) expect(first([n])).toEqual({ num: n, total: null });
  });

  it('Japanese promos print the promo code as the set size', () => {
    expect(first(['001/SV-P'])).toEqual({ num: '001', total: 'SV-P' });
    expect(first(['123/S-P'])).toEqual({ num: '123', total: 'S-P' });
    expect(first(['401/SM-P'])).toEqual({ num: '401', total: 'SM-P' });
    expect(first(['238/XY-P'])).toEqual({ num: '238', total: 'XY-P' });
    expect(first(['001/M-P'])).toEqual({ num: '001', total: 'M-P' });
    // OCR drops the dash
    expect(first(['123/SP'])).toEqual({ num: '123', total: 'S-P' });
    expect(parseCardText(['001/SV-P'])!.language).toBe('ja');
  });

  it('Korean prints are flagged so they never take a Japanese card’s price', async () => {
    const p = parseCardText(['SV2a KOR 205/165'])!;
    expect(p.language).toBe('ko');
    expect(await findScannedCard(p)).toEqual([]);
    expect(missReason(p)).toMatch(/Korean/);
  });

  it('One Piece and Riftbound', () => {
    expect(first(['ST01-012'])).toEqual({ num: 'ST01-012', total: null });
    expect(first(['OGN-301'])).toEqual({ num: 'OGN-301', total: null });
  });

  it('never takes attack damage or HP for a number', () => {
    expect(parseCardText(['Snivy', 'HP 60', 'Vine Whip 20', 'Razor Shell 10+', 'weakness x2'])).toBeNull();
  });
});

describe('promo matching', () => {
  const read = parseCardText(['Snivy', 'J MEP EN 049'])!;
  it('only takes a card from the printed promo set', () => {
    expect(fitsRead(card({ number: '049', setCode: 'MEP', name: 'Snivy - 049' }), read)).toBe(true);
    expect(fitsRead(card({ number: '049', setCode: 'SVP', name: 'Pikachu - 049' }), read)).toBe(false);
    expect(fitsRead(card({ number: '049', setCode: 'PR', name: 'Beldum - 049' }), read)).toBe(false);
  });
  it('says so plainly when the promo isn’t in the catalog', async () => {
    expect(await findScannedCard(read)).toEqual([]);
    expect(missReason(read)).toMatch(/MEP 049 isn’t in TCGplayer’s catalog yet/);
  });
});

describe('similar cards when the number finds nothing', () => {
  it('reads the name from the top line, past stage words and HP', () => {
    expect(readName(['Snivy', 'нр60X', 'Vine Whip', 'J MEP IN) 049'])).toBe('Snivy');
    expect(readName(['BASIC', 'Oshawott', 'Flip a coin If heads, this attack de'])).toBe('Oshawott');
    expect(readName(['BASIC Pikachu HP 60'])).toBe('Pikachu');
    expect(readName([{ text: '051 ★', x: 0.1, y: 0.9 }, { text: 'Oshawott', x: 0.2, y: 0.05 }])).toBe('Oshawott');
  });

  it('puts the same number first, then the read language, then price', () => {
    const p = parseCardText(['Pikachu', '1/25'])!;
    const ranked = rankSimilar(
      [
        card({ productId: 1, name: 'Pikachu - 25/102', number: '25/102', marketCents: 5000 }),
        card({ productId: 2, name: 'Pikachu (McDonald’s) - 1/25', number: '1/25', marketCents: 300 }),
        card({ productId: 3, name: 'Raichu', number: '1/25', marketCents: 900 }),
      ],
      p,
    );
    expect(ranked.map((c) => c.productId)).toEqual([2, 1]);
  });

  it('offers nothing for Korean prints or when no name was read', async () => {
    expect(await findSimilarCards(parseCardText(['피카츄', 'SV2a 025/165'])!)).toEqual([]);
    expect(await findSimilarCards(parseCardText(['J MEP EN 049'])!)).toEqual([]);
  });
});

describe('Not this card?', () => {
  it('cleans PSA subjects into catalog names', () => {
    expect(searchName('FA/CHARIZARD EX')).toBe('CHARIZARD EX');
    expect(searchName('PIKACHU-HOLO')).toBe('PIKACHU');
    expect(searchName('Umbreon VMAX')).toBe('Umbreon VMAX');
    expect(searchName('DARK GYARADOS-REV.FOIL')).toBe('DARK GYARADOS');
  });

  it('keys a raw read by number and name, so a second scan finds the correction', () => {
    const a = parseCardText(['Snivy', 'J MEP EN 049'])!;
    const b = parseCardText(['Snivy', 'J MEP IN) 49'])!;
    expect(correctionKey(a)).toBe(correctionKey(b));
    expect(correctionKey(a)).not.toBe(correctionKey(parseCardText(['Oshawott', 'J MEP EN 049'])!));
  });

  it('puts a remembered card first and makes it the confident pick', async () => {
    const m = [
      { card: card({ productId: 7, name: 'A' }), score: 5 },
      { card: card({ productId: 8, name: 'B' }), score: 1 },
    ];
    const out = await withCorrection(m, 8);
    expect(out.map((x) => x.card.productId)).toEqual([8, 7]);
    expect(isConfident(out)).toBe(true);
    expect(await withCorrection(m, undefined)).toBe(m);
  });

  it('fetches a remembered card the number didn’t find', async () => {
    const out = await withCorrection([], 9000004);
    expect(out[0].card.name).toMatch(/Mew ex/);
  });

  it('offers no other prints for Korean slabs', async () => {
    expect(await similarForSlab({ name: 'PIKACHU', number: '25', language: 'ko' })).toEqual([]);
  });
});

describe('alternate art numbers', () => {
  it('match TCGplayer lower-case letters ("063a/166")', () => {
    const { numberVariants } = require('../cardScan');
    expect(numberVariants({ num: '063A', total: '166' })).toContain('063a/166');
  });
});
