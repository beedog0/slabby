import {
  localKey,
  pictureIndex,
  riotCardsFromPage,
  riotCode,
  riotIndex,
  riotPicture,
  setKeys,
  tcgdexJpg,
  tcgdexPicture,
} from '../../../supabase/functions/_shared/alt-images';

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

describe('Riftbound pictures from Riot', () => {
  const pic = (code: string, name: string) => ({ publicCode: code, name, cardImage: { url: `https://riot/${code}.png` } });
  const index = riotIndex([
    pic('RAD-173/167', 'The Exile'),
    pic('RAD-179/167', 'Aphelios'),
    pic('RAD-176/167', 'Exemplar of Demacia'),
    pic('SFD-227*/221', 'Ahri'),
    pic('RAD-R04a', 'Body Rune'),
    pic('UNL-T02', 'Bird'),
    pic('OGN-257/298', 'Blind Monk'),
    pic('OGN-001/298', 'Something'),
    { publicCode: 'OGN-002/298', name: 'No picture', cardImage: null },
  ]);

  it('reads card codes, ignoring leading zeros and keeping the signature star', () => {
    expect(riotCode('RAD-173*/167')).toEqual({ set: 'RAD', local: '173*', total: '167' });
    expect(riotCode('RAD-R04a')).toEqual({ set: 'RAD', local: 'R4A', total: null });
    expect(riotCode('nonsense')).toBeNull();
    expect(index.setByTotal.get('298')).toBe('OGN');
  });

  it('matches by set and number when the Riot name is in the TCGplayer name', () => {
    expect(riotPicture(index, { set_code: 'SFD', number: '227*/221', name: 'Ahri, Nine-Tailed Fox (Signature)' })).toEqual({
      url: 'https://riot/SFD-227*/221.png',
      source: 'riot',
    });
    expect(riotPicture(index, { set_code: 'RAD', number: 'R04a', name: 'Body Rune (R04a)' })?.source).toBe('riot');
    expect(riotPicture(index, { set_code: 'UNL', number: 'T02 // T04', name: 'Bird // Buff' })?.url).toBe('https://riot/UNL-T02.png');
  });

  it("gives a signature Riot hasn't posted the same art without the signature", () => {
    expect(riotPicture(index, { set_code: 'RAD', number: '173*/167', name: 'Riven, The Exile (Signature)' })).toEqual({
      url: 'https://riot/RAD-173/167.png',
      source: 'riot_base',
    });
  });

  it('never shows another card when TCGplayer has the wrong number', () => {
    // TCGplayer lists Jarvan IV's signature as 179*, which is Aphelios on Riot's gallery.
    expect(riotPicture(index, { set_code: 'RAD', number: '179*/167', name: 'Jarvan IV, Exemplar of Demacia (Signature)' })).toBeNull();
  });

  it('lets a play promo borrow the main set its total names, only for the same card', () => {
    expect(riotPicture(index, { set_code: 'OPP', number: '257/298', name: 'Lee Sin, Blind Monk (Metal) (Prize Wall)' })?.url).toBe(
      'https://riot/OGN-257/298.png',
    );
    expect(riotPicture(index, { set_code: 'OPP', number: '001/298', name: 'Another Card' })).toBeNull();
    expect(riotPicture(index, { set_code: 'OPP', number: '002/298', name: 'No picture' })).toBeNull();
    expect(riotPicture(index, { set_code: 'T12025', number: 'T1S 001/005', name: 'Ambessa' })).toBeNull();
  });

  it('finds the card list in the gallery page', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { page: { blades: [{}, { cards: { items: [pic('RAD-173/167', 'The Exile')] } }] } } },
    })}</script></html>`;
    expect(riotCardsFromPage(html)).toHaveLength(1);
    expect(riotCardsFromPage('<html></html>')).toEqual([]);
  });
});
