import { cardKey } from '../../pricing/cardKey';
import { cardForSearch } from '../estimate';
import type { CatalogCard } from '../search';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const base = { productId: 1, imageUrl: null, marketCents: null, lowCents: null } as unknown as CatalogCard;

describe('cardForSearch: Find a price from search and con mode', () => {
  it('keys a searched card the way it is keyed once added, so the estimate carries over', () => {
    const rayquaza = { ...base, game: 'pokemon', language: 'ja', name: 'Rayquaza', number: '055/050', setName: 'BW5: Dragon Blast', setCode: 'BW5' } as CatalogCard;
    expect(cardKey(cardForSearch(rayquaza, 'psa10'))).toBe('psa:10:BW5:055:ja');
    expect(cardKey(cardForSearch(rayquaza, 'raw'))).toBe('raw:0:BW5:055:ja');
  });

  it('carries the game, so the search looks for a One Piece card', () => {
    const luffy = { ...base, game: 'onepiece', language: 'en', name: 'Monkey.D.Luffy (Alternate Art)', number: 'OP05-119', setName: 'Awakening of the New Era', setCode: 'OP05' } as CatalogCard;
    const c = cardForSearch(luffy, 'psa10');
    expect(c).toMatchObject({ game: 'onepiece', grader: 'psa', grade: 10, name: 'Monkey.D.Luffy (Alternate Art)' });
  });
});
