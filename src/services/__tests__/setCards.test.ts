jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { arrangeSet, matchSet, numberKey, rarities, setKey } from '../setCards';
import type { Found } from '../searchFilters';

const f = (productId: number, number: string, market: number | null, rarity: string, change7d: number | null): Found => ({
  productId, number, marketCents: market, rarity, change7d, change30d: null,
  game: 'pokemon', language: 'en', name: `Card ${productId}`, setName: 'SWSH07: Evolving Skies', setCode: 'EVS', imageUrl: null, lowCents: null,
});

describe('set page helpers', () => {
  const cards = [f(1, '215/203', 142000, 'Secret Rare', 0.05), f(2, '7/203', 300, 'Common', null), f(3, '189/203', 34500, 'Ultra Rare', -0.08), f(4, 'TG12', null, 'Common', 0.01)];

  it('sorts by price, number and 7-day move', () => {
    expect(arrangeSet(cards, 'price', null).map((c) => c.productId)).toEqual([1, 3, 2, 4]);
    expect(arrangeSet(cards, 'number', null).map((c) => c.productId)).toEqual([2, 4, 3, 1]);
    expect(arrangeSet(cards, 'rising', null).map((c) => c.productId)).toEqual([1, 4, 3]);
    expect(arrangeSet(cards, 'falling', null).map((c) => c.productId)).toEqual([3, 4, 1]);
    expect(arrangeSet(cards, 'price', 'Common').map((c) => c.productId)).toEqual([2, 4]);
  });

  it('counts rarities', () => {
    expect(rarities(cards)[0]).toEqual({ rarity: 'Common', n: 2 });
  });

  it('reads card numbers', () => {
    expect([numberKey('205/165'), numberKey('TG12'), numberKey('SV-P 045'), numberKey(null)]).toEqual([205, 12, 45, Number.MAX_SAFE_INTEGER]);
  });

  it('matches TCGplayer set names to the Pokémon TCG API', () => {
    const api = [{ name: 'Evolving Skies' }, { name: '151' }, { name: 'Scarlet & Violet' }, { name: 'Pokémon GO' }];
    expect(setKey('SWSH07: Evolving Skies')).toBe('evolvingskies');
    expect(matchSet(api, 'SWSH07: Evolving Skies')?.name).toBe('Evolving Skies');
    expect(matchSet(api, 'SV: Scarlet & Violet 151')?.name).toBe('151');
    expect(matchSet(api, 'Pokemon GO')?.name).toBe('Pokémon GO');
    expect(matchSet(api, 'Premium Champion Pack')).toBeNull();
  });
});
