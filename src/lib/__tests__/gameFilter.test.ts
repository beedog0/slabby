import { effectiveGame, gamesIn, inGame } from '../games';

const row = (game?: 'pokemon' | 'onepiece' | 'riftbound') => ({ card: { game } });

describe('game filter', () => {
  it('lists the games present, in app order, old cards as Pokémon', () => {
    expect(gamesIn([{ game: 'riftbound' }, {}, { game: 'onepiece' }])).toEqual(['pokemon', 'onepiece', 'riftbound']);
    expect(gamesIn([{}, { game: 'pokemon' }])).toEqual(['pokemon']);
    expect(gamesIn([])).toEqual([]);
  });

  it('falls back to All when the picked game is gone or the vault has one game', () => {
    expect(effectiveGame('onepiece', ['pokemon', 'onepiece'])).toBe('onepiece');
    expect(effectiveGame('riftbound', ['pokemon', 'onepiece'])).toBe('all');
    expect(effectiveGame('pokemon', ['pokemon'])).toBe('all');
    expect(effectiveGame('all', ['pokemon', 'onepiece'])).toBe('all');
  });

  it('keeps only the picked game', () => {
    const rows = [row(), row('onepiece'), row('pokemon'), row('riftbound')];
    expect(inGame(rows, 'all')).toHaveLength(4);
    expect(inGame(rows, 'pokemon')).toEqual([rows[0], rows[2]]);
    expect(inGame(rows, 'onepiece')).toEqual([rows[1]]);
  });
});
