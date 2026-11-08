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

import { effectivePick, filterMenu, hasChoices, inPick, setsFor } from '../games';

describe('game and set filter', () => {
  const cards = [
    { game: undefined, setName: 'Evolving Skies' },
    { game: undefined, setName: '151' },
    { game: 'pokemon' as const, setName: '151' },
    { game: 'onepiece' as const, setName: 'OP05' },
    { game: 'onepiece' as const, setName: null },
  ];
  const menu = filterMenu(cards);

  it('counts games and lists each game’s sets, biggest first', () => {
    expect(menu.games).toEqual(['pokemon', 'onepiece']);
    expect(menu.counts).toEqual({ pokemon: 3, onepiece: 2 });
    expect(menu.sets.pokemon).toEqual([
      { name: '151', count: 2 },
      { name: 'Evolving Skies', count: 1 },
    ]);
    expect(menu.sets.onepiece).toEqual([{ name: 'OP05', count: 1 }]);
    expect(hasChoices(menu)).toBe(true);
  });

  it('offers sets in a one-game vault, and nothing with one set', () => {
    const one = filterMenu(cards.slice(0, 3));
    expect(setsFor(one, 'all').map((s) => s.name)).toEqual(['151', 'Evolving Skies']);
    expect(hasChoices(one)).toBe(true);
    expect(hasChoices(filterMenu([{ setName: '151' }, { setName: '151' }]))).toBe(false);
    expect(effectivePick({ game: 'all', set: '151' }, one)).toEqual({ game: 'all', set: '151' });
  });

  it('drops a set that is gone or belongs to another game', () => {
    expect(effectivePick({ game: 'pokemon', set: '151' }, menu)).toEqual({ game: 'pokemon', set: '151' });
    expect(effectivePick({ game: 'onepiece', set: '151' }, menu)).toEqual({ game: 'onepiece', set: null });
    expect(effectivePick({ game: 'riftbound', set: 'OGN' }, menu)).toEqual({ game: 'all', set: null });
  });

  it('keeps rows in the picked game and set', () => {
    const rows = cards.map((card) => ({ card }));
    expect(inPick(rows, { game: 'pokemon', set: '151' })).toEqual([rows[1], rows[2]]);
    expect(inPick(rows, { game: 'onepiece', set: null })).toEqual([rows[3], rows[4]]);
  });
});
