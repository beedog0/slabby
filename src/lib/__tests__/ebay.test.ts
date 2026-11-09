import { ebayCardListedUrl, ebayCardQuery, ebayCardSoldUrl, ebaySoldQuery, ebaySoldUrl } from '../ebay';

const mew = { name: 'Mew ex', setName: '151', number: '205', grader: 'psa' as const, grade: 10 };

describe('eBay sold search', () => {
  it('names the card, set, number, grader and grade', () => {
    expect(ebaySoldQuery(mew)).toBe('Mew ex 151 205 PSA 10');
    expect(ebaySoldQuery({ ...mew, grader: 'bgs', grade: 9.5, setName: null })).toBe('Mew ex 205 BGS 9.5');
  });
  it('builds the sold + completed listings URL', () => {
    expect(ebaySoldUrl(mew)).toBe('https://www.ebay.com/sch/i.html?_nkw=Mew+ex+151+205+PSA+10&LH_Sold=1&LH_Complete=1');
    expect(ebaySoldUrl({ ...mew, name: 'Pokémon & Co' })).toContain('_nkw=Pok%C3%A9mon+%26+Co+151');
  });
});

describe('eBay search for a catalog card', () => {
  const zard = { name: 'Charizard ex', setName: 'SV03: Obsidian Flames', number: '223/197', language: 'en', grade: 'psa10' as const };
  it('names the card, set without its code, number and grade', () => {
    expect(ebayCardQuery(zard)).toBe('Charizard ex Obsidian Flames 223/197 PSA 10');
  });
  it('keeps slabs out of raw searches', () => {
    expect(ebayCardQuery({ ...zard, grade: 'raw' })).toBe('Charizard ex Obsidian Flames 223/197 -PSA -BGS -CGC');
  });
  it('says Japanese for JP cards and drops OR-syntax characters', () => {
    expect(ebayCardQuery({ name: 'Pikachu (Alternate Art)', setName: 'Promo', number: null, language: 'ja', grade: 'psa9' })).toBe(
      'Pikachu Alternate Art Promo Japanese PSA 9',
    );
  });
  it('builds sold and cheapest-first listed URLs', () => {
    expect(ebayCardSoldUrl(zard)).toBe('https://www.ebay.com/sch/i.html?_nkw=Charizard+ex+Obsidian+Flames+223%2F197+PSA+10&LH_Sold=1&LH_Complete=1');
    expect(ebayCardListedUrl(zard)).toBe('https://www.ebay.com/sch/i.html?_nkw=Charizard+ex+Obsidian+Flames+223%2F197+PSA+10&_sop=15');
  });
});
