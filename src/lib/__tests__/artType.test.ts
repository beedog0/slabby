import { ART_TYPES, artTypeOf } from '../artType';

// Rarity names and name tags as they appear in the live catalog (counted 2026-11-08).
const pk = (rarity: string | null, name = 'Pikachu', number: string | null = '025/165', language = 'en') => artTypeOf({ game: 'pokemon', language, rarity, name, number });
const op = (rarity: string, name = 'Monkey.D.Luffy') => artTypeOf({ game: 'onepiece', language: 'en', rarity, name, number: 'OP01-001' });
const rb = (rarity: string, name = 'Jinx') => artTypeOf({ game: 'riftbound', language: 'en', rarity, name, number: '001/298' });

describe('artTypeOf, Pokémon English', () => {
  it('reads the modern rarities', () => {
    expect(pk('Common')).toBe('standard');
    expect(pk('Uncommon')).toBe('standard');
    expect(pk('Rare')).toBe('standard');
    expect(pk('Holo Rare')).toBe('holo');
    expect(pk('Double Rare', 'Charizard ex', '006/165')).toBe('holo');
    expect(pk('Illustration Rare', 'Pikachu', '173/165')).toBe('illustration');
    expect(pk('Special Illustration Rare', 'Charizard ex', '199/165')).toBe('special_illustration');
    expect(pk('Hyper Rare', 'Charizard ex', '210/165')).toBe('secret');
    expect(pk('Mega Hyper Rare')).toBe('secret');
    expect(pk('Secret Rare')).toBe('secret');
    expect(pk('Rainbow Rare')).toBe('secret');
    expect(pk('Promo', 'Pikachu', 'SVP 027')).toBe('promo');
  });

  it('tells a full-art Ultra Rare from a regular one by its number', () => {
    expect(pk('Ultra Rare', 'Charizard ex', '183/165')).toBe('full_art');
    expect(pk('Ultra Rare', 'Charizard V', '017/189')).toBe('holo');
    expect(pk('Ultra Rare', 'Charizard V (Full Art)', '153/189')).toBe('full_art');
    expect(pk('Shiny Ultra Rare')).toBe('full_art');
  });

  it('uses name tags for alt arts and older secrets', () => {
    expect(pk('Ultra Rare', 'Rayquaza V (Alternate Full Art)', '194/203')).toBe('alt_art');
    expect(pk('Secret Rare', 'Umbreon VMAX (Alternate Art Secret)', '215/203')).toBe('alt_art');
    expect(pk('Holo Rare', 'Charizard (Secret)', '107/105')).toBe('secret');
  });

  it('puts Trainer Gallery and Galarian Gallery with illustration rares', () => {
    expect(pk('Holo Rare', 'Pikachu', 'TG05/TG30')).toBe('illustration');
    expect(pk('Ultra Rare', 'Mewtwo VSTAR', 'GG44/GG70')).toBe('illustration');
  });

  it('keeps print patterns and stamps as what the card is', () => {
    expect(pk('Common', 'Pikachu (Poke Ball Pattern)')).toBe('standard');
    expect(pk('Holo Rare', 'Mew (Cosmos Holo)')).toBe('holo');
    expect(pk('Shiny Holo Rare')).toBe('holo');
    expect(pk('Radiant Rare')).toBe('holo');
    expect(pk('ACE SPEC Rare')).toBe('holo');
    expect(pk('Classic Collection')).toBe('holo');
    expect(pk('Unconfirmed')).toBe('standard');
    expect(pk(null)).toBe('standard');
  });
});

describe('artTypeOf, Pokémon Japanese', () => {
  const ja = (rarity: string | null, number = '100/078') => pk(rarity, 'Pikachu', number, 'ja');
  it('maps the Japanese letters', () => {
    expect(ja('Art Rare')).toBe('illustration');
    expect(ja('Special Art Rare')).toBe('special_illustration');
    expect(ja('Character Rare')).toBe('illustration');
    expect(ja('Character Super Rare')).toBe('special_illustration');
    expect(ja('Super Rare')).toBe('full_art');
    expect(ja('Trainer Rare')).toBe('full_art');
    expect(ja('Ultra Rare')).toBe('secret');
    expect(ja('Mega Ultra Rare')).toBe('secret');
    expect(ja('Shiny Secret Rare')).toBe('secret');
    expect(ja('Double Rare', '010/078')).toBe('holo');
    expect(ja('Triple Rare', '010/078')).toBe('holo');
    expect(ja('Super Rare Holo')).toBe('holo');
    expect(ja('Kagayaku')).toBe('holo');
    expect(ja('None')).toBe('standard');
    expect(ja(null)).toBe('standard');
  });
});

describe('artTypeOf, One Piece', () => {
  it('maps the rarity codes', () => {
    expect(op('C')).toBe('standard');
    expect(op('UC')).toBe('standard');
    expect(op('R')).toBe('standard');
    expect(op('SR')).toBe('standard');
    expect(op('L')).toBe('standard');
    expect(op('SEC')).toBe('secret');
    expect(op('TR')).toBe('secret');
    expect(op('PR')).toBe('promo');
  });
  it('reads the art tags', () => {
    expect(op('SR', 'Roronoa Zoro (Parallel)')).toBe('alt_art');
    expect(op('L', 'Monkey.D.Luffy (Alternate Art)')).toBe('alt_art');
    expect(op('SEC', 'Shanks (Manga)')).toBe('alt_art');
    expect(op('SR', 'Nami (SP)')).toBe('alt_art');
    expect(op('R', 'Nico Robin (Full Art)')).toBe('full_art');
    expect(op('C', 'Usopp (Pirate Foil)')).toBe('standard');
    expect(op('R', 'Sanji (Reprint)')).toBe('standard');
  });
});

describe('artTypeOf, Riftbound', () => {
  it('maps rarities and tags', () => {
    expect(rb('Common')).toBe('standard');
    expect(rb('Epic')).toBe('standard');
    expect(rb('Showcase')).toBe('alt_art');
    expect(rb('Showcase', 'Jinx (Overnumbered)')).toBe('alt_art');
    expect(rb('Rare', 'Jinx (Alternate Art)')).toBe('alt_art');
    expect(rb('Showcase', 'Jinx (Signature)')).toBe('secret');
    expect(rb('Showcase', 'Jinx (Metal)')).toBe('secret');
    expect(rb('Promo')).toBe('promo');
    expect(rb('None')).toBe('standard');
  });
});

it('every art type has a place in the order', () => {
  expect(new Set(ART_TYPES).size).toBe(8);
});
