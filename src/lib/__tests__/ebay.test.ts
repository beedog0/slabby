import { ebaySoldQuery, ebaySoldUrl } from '../ebay';

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
