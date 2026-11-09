import { localKey, pictureIndex, setKeys, tcgdexJpg, tcgdexPicture } from '../../../supabase/functions/_shared/alt-images';

describe('localKey', () => {
  it('matches TCGplayer numbers to TCGdex local ids, ignoring totals and leading zeros', () => {
    expect(localKey('029/070')).toBe('29');
    expect(localKey('029')).toBe(localKey('29'));
    expect(localKey('TG01/TG30')).toBe(localKey('TG01'));
    expect(localKey('SWSH001')).toBe(localKey('SWSH001'));
    expect(localKey('SVP 085')).toBe('SVP 085');
  });
});

describe('setKeys', () => {
  it('uses the set id in Japanese and the official abbreviation in English', () => {
    expect(setKeys({ id: 'SV2a' }, 'ja')).toEqual(['SV2A']);
    expect(setKeys({ id: 'sv10.5w', abbreviation: { official: 'WHT' } }, 'en')).toEqual(['WHT']);
  });
  it("never lets a Trainer Gallery's tcgOnline code stand in for the main set", () => {
    expect(setKeys({ id: 'swsh12tg', abbreviation: { official: 'SIT:TG' }, tcgOnline: 'SIT' }, 'en')).toEqual(['SIT:TG']);
  });
});

describe('tcgdexPicture', () => {
  const set = {
    id: 'sv10.5w',
    abbreviation: { official: 'WHT' },
    cards: [
      { localId: '001', image: 'https://assets.tcgdex.net/en/sv/sv10.5w/001' },
      { localId: '002' }, // no picture on TCGdex either
    ],
  };
  const sets = new Map([['WHT', pictureIndex(set)]]);
  it('finds a card by set code and number', () => {
    expect(tcgdexPicture(sets, { set_code: 'wht', number: '001/086' })).toBe('https://assets.tcgdex.net/en/sv/sv10.5w/001/high.jpg');
  });
  it('returns null when TCGdex has no picture, no such card, or no such set', () => {
    expect(tcgdexPicture(sets, { set_code: 'WHT', number: '002/086' })).toBeNull();
    expect(tcgdexPicture(sets, { set_code: 'WHT', number: '150/086' })).toBeNull();
    expect(tcgdexPicture(sets, { set_code: 'L1: SS', number: '029/070' })).toBeNull();
    expect(tcgdexPicture(sets, { set_code: 'WHT', number: null })).toBeNull();
  });
  it('builds JPEG urls', () => {
    expect(tcgdexJpg('https://x/ja/SV/SV2a/001/', 'low')).toBe('https://x/ja/SV/SV2a/001/low.jpg');
  });
});
