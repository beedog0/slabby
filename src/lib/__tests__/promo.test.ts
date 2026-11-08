import { isPromo, promoTag } from '../format';

describe('isPromo', () => {
  it('reads promo sets, rarities and numbers', () => {
    expect(isPromo({ setName: 'SV: Scarlet & Violet Promo Cards', number: '049' })).toBe(true);
    expect(isPromo({ setName: 'SV-P Promotional Cards', number: '001/SV-P' })).toBe(true);
    expect(isPromo({ setName: 'One Piece Promotion Cards', number: 'P-001' })).toBe(true);
    expect(isPromo({ setName: 'WoTC Promo', number: '8' })).toBe(true);
    expect(isPromo({ setName: 'Black Star Promos', number: '12' })).toBe(true);
    expect(isPromo({ setName: 'Unknown', rarity: 'Promo' })).toBe(true);
    expect(isPromo({ setName: 'M-P Promotional Cards', number: '013/30th-P' })).toBe(true);
    expect(isPromo({ setName: null, number: 'SWSH123' })).toBe(true);
    expect(isPromo({ setName: 'Golden Box', variety: 'Promo' })).toBe(true);
  });

  it('leaves regular set cards alone', () => {
    expect(isPromo({ setName: 'ME: 30th Celebration', number: '148/128', rarity: 'Special Illustration Rare' })).toBe(false);
    expect(isPromo({ setName: 'Unbroken Bonds', number: '209/214' })).toBe(false);
    expect(isPromo({ setName: 'Promontory', number: '1/100' })).toBe(false);
    expect(isPromo({ setName: 'Crown Zenith', number: 'GG01/GG70' })).toBe(false);
  });

  it('skips the word when the set name beside it already says promo', () => {
    expect(promoTag({ setName: 'SV: Scarlet & Violet Promo Cards' }, { setShown: true })).toBeNull();
    expect(promoTag({ setName: 'SV: Scarlet & Violet Promo Cards' })).toBe('Promo');
    expect(promoTag({ setName: 'Paldea Evolved', number: '001/SV-P' }, { setShown: true })).toBe('Promo');
  });
});
