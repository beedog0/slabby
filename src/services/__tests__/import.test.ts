import { gradeOf, moneyCents, parseCsv, parseImport, splitTitle } from '../importCsv';
import { cardsFor, matchAll, overlap, pick } from '../importMatch';
import type { CatalogCard } from '../search';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, newlines in quotes, CRLF and a BOM', () => {
    const t = '﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3';
    expect(parseCsv(t)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '2', '3'],
    ]);
  });
  it('reads tab-separated sheets', () => {
    expect(parseCsv('Name\tQty\nMew ex\t2')).toEqual([
      ['Name', 'Qty'],
      ['Mew ex', '2'],
    ]);
  });
});

describe('values', () => {
  it('money', () => {
    expect(moneyCents('$1,234.50')).toBe(123450);
    expect(moneyCents('12')).toBe(1200);
    expect(moneyCents('1.234,50')).toBe(123450);
    expect(moneyCents('')).toBeNull();
    expect(moneyCents('0')).toBeNull();
  });
  it('grades', () => {
    expect(gradeOf('PSA 10')).toEqual({ grader: 'psa', grade: 10, other: null });
    expect(gradeOf('9.5', 'Beckett')).toEqual({ grader: 'bgs', grade: 9.5, other: null });
    expect(gradeOf('CGC Pristine 10')).toEqual({ grader: 'cgc', grade: 10, other: null });
    expect(gradeOf('Grade 9')).toEqual({ grader: 'psa', grade: 9, other: null });
    expect(gradeOf('Ungraded').grader).toBe('raw');
    expect(gradeOf('')).toEqual({ grader: 'raw', grade: null, other: null });
    expect(gradeOf('SGC 10')).toEqual({ grader: 'raw', grade: null, other: 'SGC 10' });
  });
  it('titles with the number in them', () => {
    expect(splitTitle('Charizard - 4/102')).toEqual({ name: 'Charizard', number: '4/102' });
    expect(splitTitle('Snorunt - 046/217 (Love Ball)')).toEqual({ name: 'Snorunt (Love Ball)', number: '046/217' });
    expect(splitTitle('Charizard [1st Edition] #4')).toEqual({ name: 'Charizard (1st Edition)', number: '4' });
    expect(splitTitle('Mew ex')).toEqual({ name: 'Mew ex', number: null });
  });
});

const COLLECTR = `Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price,Price Override,Watchlist,Date Added,Notes
Main,Pokemon,SWSH07: Evolving Skies,Umbreon VMAX (Alternate Art Secret),215/203,Secret Rare,Holofoil,PSA 10,,"$1,450.00",1,$1700.00,,false,2026-01-02,
Main,Pokemon,SV: Prismatic Evolutions,Umbreon ex,161/131,Special Illustration Rare,Holofoil,Ungraded,Near Mint,$600.00,3,$900.00,,false,2026-01-02,
Main,Pokemon,SV: Prismatic Evolutions,Elite Trainer Box,,,,,,$60.00,2,$90.00,,false,2026-01-02,
Main,Pokemon,Some Korean Set,Pikachu,001/100,Promo,,PSA 9,,$20,1,,,false,2026-01-02,`;

describe('parseImport', () => {
  it('reads a Collectr export and never its prices', () => {
    const p = parseImport(COLLECTR);
    expect(p.source).toBe('collectr');
    expect(p.skipped).toBe(1); // the sealed box
    expect(p.rows[0]).toMatchObject({
      name: 'Umbreon VMAX (Alternate Art Secret)',
      number: '215',
      grader: 'psa',
      grade: 10,
      paidCents: 145000,
      quantity: 1,
      game: 'pokemon',
      language: null, // Collectr has no language column
    });
    expect(p.rows[1]).toMatchObject({ grader: 'raw', grade: null, condition: 'near mint', quantity: 3, paidCents: 60000 });
    expect(JSON.stringify(p.rows)).not.toContain('170000');
  });

  it('reads a spreadsheet with cert numbers and a title line above the headers', () => {
    const t = `My cards exported 2026-11-08\nCard,Set,#,Grade,Cert #,Paid\nMew ex,SV2a Japanese,205/165,10,"12,345,678",$300`;
    const [r] = parseImport(t).rows;
    expect(r).toMatchObject({ name: 'Mew ex', number: '205', language: 'ja', grader: 'psa', grade: 10, cert: '12345678', quantity: 1 });
  });

  it('reads a TCGplayer export by product id', () => {
    const t = `Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU\n2,Pikachu ex - 238/191,Pikachu ex,SV08: Surging Sparks,238/191,SSP,Holofoil,Near Mint Holofoil,English,SIR,9000005,1`;
    const p = parseImport(t);
    expect(p.source).toBe('tcgplayer');
    expect(p.rows[0]).toMatchObject({ productId: 9000005, quantity: 2, condition: 'near mint', name: 'Pikachu ex', number: '238' });
  });

  it('refuses a file with no name column', () => {
    expect(() => parseImport('a,b\n1,2')).toThrow('No card name column');
  });
});

describe('matching (mock catalog)', () => {
  it('matches by name and number, by product id, and leaves Korean cards unmatched', async () => {
    const p = parseImport(COLLECTR);
    const m = await matchAll(p.rows);
    expect(m[0].card?.productId).toBe(9000001);
    expect(m[1].card?.productId).toBe(9000003);
    expect(m[2].card).toBeNull(); // set name doesn't make it Korean, but nothing named Pikachu 001 exists
    const tcg = await matchAll(
      parseImport('Quantity,Name,Product ID\n1,Whatever,9000005').rows,
    );
    expect(tcg[0].card?.name).toContain('Pikachu ex');
  });

  it('keeps a wrong number from matching', async () => {
    const [m] = await matchAll(parseImport('Name,Number\nCharizard ex,200').rows);
    expect(m.card).toBeNull();
  });

  it('matches Japanese only to Japanese', async () => {
    const [ja] = await matchAll(parseImport('Name,Number,Language\nMew ex,205,Japanese').rows);
    const [en] = await matchAll(parseImport('Name,Number,Language\nMew ex,205,English').rows);
    expect(ja.card?.productId).toBe(9000004);
    expect(en.card).toBeNull();
  });

  it('makes one vault card per copy, with the catalog photo and the row paid', async () => {
    const p = parseImport(COLLECTR);
    const [, raw] = await matchAll(p.rows);
    const cards = cardsFor(raw, 'hold');
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    expect(cards[0]).toMatchObject({ grader: 'raw', grade: null, paidCents: 60000, setCode: 'PRE', name: 'Umbreon ex', number: '161', condition: 'near mint' });
  });

  it('word overlap', () => {
    expect(overlap('Umbreon VMAX', 'Umbreon VMAX (Alternate Art Secret)')).toBe(1);
    expect(overlap('Pikachu', 'Raichu')).toBe(0);
  });
});

// Header and row shapes copied from a real Collectr export (2026-11-09), prices changed.
const REAL = `Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-11-09),Price Override,Watchlist,Date Added,Notes
,Pokemon,Paradox Rift,Mantyke,189/182,Illustration Rare,,,,,,30.15,0,true,,
GRADE THESE,Pokemon,Mega Evolution Promos,N's Zekrom,031,Promo,Holofoil,Ungraded,Near Mint,0,1,5.62,0,false,2026-03-21,
Main,Pokemon,Yamabuki City Gym Deck,Sabrina's Gengar (JP),094,Rare,Normal,Ungraded,Near Mint,0,1,9.99,0,false,2026-03-21,
Main,Pokemon,25th Anniversary Promo (JP),Pikachu (JP),003/015,Common,Holofoil,PSA 10.0 GEM - MT,,250,1,999,0,false,2026-03-21,
Main,Pokemon,Miscellaneous Cards & Products,Ditto (KR),173/SV-P,Promo,,PSA 10.0 GEM - MT,,40,1,99,0,false,2026-03-21,
Main,Pokemon,Mega Symphonia,Mega Gengar ex,087/063,Mega Attack Rare,Holofoil,Ungraded,Near Mint,0,2,99,0,false,2026-03-21,
Main,Pokemon,Ascended Heroes,Marill (Friend Ball),083/217,Common,Reverse Holofoil,Ungraded,Near Mint,0,1,1,0,false,2026-03-21,
selling,Pokemon,Triumphant,Mew (Prime),97,Ultra Rare,Holofoil,PSA 5.0 EX,,,1,99,0,false,2026-03-21,
Main,Riftbound,Origins,Chaos Rune (R05a),R05a,Common,Foil,Ungraded,Near Mint,0,1,1,0,false,2026-03-21,`;

describe('real Collectr export', () => {
  const p = parseImport(REAL);
  const by = (n: string) => p.rows.find((r) => r.name === n)!;
  it('leaves watchlist cards out', () => {
    expect(p.watchlist).toBe(1);
    expect(p.rows.find((r) => r.name === 'Mantyke')).toBeUndefined();
  });
  it('reads (JP) and (KR) tags as language and drops them from the name', () => {
    expect(by("Sabrina's Gengar")).toMatchObject({ language: 'ja', number: '094' });
    expect(by('Pikachu')).toMatchObject({ language: 'ja', grader: 'psa', grade: 10 });
    expect(by('Ditto')).toMatchObject({ language: 'ko', grade: 10 });
  });
  it('has no language column, so untagged cards are open to either language', () => {
    expect(by('Mega Gengar ex').language).toBeNull();
    expect(by("N's Zekrom").language).toBeNull();
  });
  it('reads PSA grades with words after them', () => {
    expect(by('Mew (Prime)')).toMatchObject({ grader: 'psa', grade: 5 });
  });
  it('paid 0 is unknown, and Riftbound is its own game', () => {
    expect(by("N's Zekrom").paidCents).toBeNull();
    expect(by('Chaos Rune (R05a)').game).toBe('riftbound');
  });
  it('reverse holo printing reaches the vault card', () => {
    expect(cardsFor({ row: by('Marill (Friend Ball)'), card: null }, 'hold')[0].finish).toBe('reverse');
  });
});

const cat = (o: Partial<CatalogCard>): CatalogCard => ({
  productId: Math.floor(Math.random() * 1e9),
  game: 'pokemon',
  language: 'en',
  name: 'x',
  number: null,
  rarity: null,
  setName: 'x',
  setCode: null,
  imageUrl: null,
  marketCents: null,
  lowCents: null,
  ...o,
});

describe('pick', () => {
  const p = parseImport(REAL);
  const by = (n: string) => p.rows.find((r) => r.name === n)!;
  it('takes a Japanese card for an untagged Japanese set', () => {
    const jp = cat({ language: 'ja', name: 'Mega Gengar ex - 087/063', number: '087/063', setName: 'M1S: Mega Symphonia' });
    const en = cat({ name: 'Mega Gengar ex - 087/132', number: '087/132', setName: 'ME03: Something Else' });
    expect(pick(by('Mega Gengar ex'), [en, jp])).toBe(jp);
  });
  it('matches a promo whose number carries the set prefix, only inside that set', () => {
    const promo = cat({ name: "N's Zekrom - MEP031", number: 'MEP031', setName: 'ME: Mega Evolution Promo' });
    const other = cat({ name: "N's Zekrom - 031/100", number: '031/100', setName: 'Some Other Set' });
    expect(pick(by("N's Zekrom"), [other, promo])).toBe(promo);
    expect(pick(by("N's Zekrom"), [other])).toBeNull();
  });
  it('picks the Friend Ball print over the plain one with the same number', () => {
    const plain = cat({ name: 'Marill - 083/217', number: '083/217', setName: 'ASC: Ascended Heroes' });
    const ball = cat({ name: 'Marill - 083/217 (Friend Ball)', number: '083/217', setName: 'ASC: Ascended Heroes' });
    expect(pick(by('Marill (Friend Ball)'), [plain, ball])).toBe(ball);
  });
  it('keeps a Japanese-tagged card off English prints', () => {
    const en = cat({ name: "Sabrina's Gengar", number: '094', setName: 'Gym Challenge' });
    expect(pick(by("Sabrina's Gengar"), [en])).toBeNull();
  });
});

describe('candidates (mock catalog)', () => {
  const { candidates } = require('../importMatch');
  it('offers same-name cards, the row’s own printing first', async () => {
    const [row] = parseImport('Name,Set,Number\nUmbreon,Prismatic Evolutions,161').rows;
    const list = await candidates(row);
    expect(list[0].productId).toBe(9000003);
    expect(list.map((c: CatalogCard) => c.productId)).toEqual(expect.arrayContaining([9000001, 9000002]));
  });
  it('offers nothing for Korean cards', async () => {
    const [row] = parseImport('Name,Number\nUmbreon ex (KR),161').rows;
    expect(await candidates(row)).toEqual([]);
  });
});
