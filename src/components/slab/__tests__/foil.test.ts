import { foilOf } from '../foil';
import type { Card } from '../../../types';

const card = (over: Partial<Card> & { variety?: string }) => ({ name: 'Pikachu', grader: 'psa', ...over }) as Card;

describe('foilOf', () => {
  it('uses the finish the print picker set, even when it says none', () => {
    expect(foilOf(card({ name: 'Mew ex', finish: 'reverse' }))).toBe('reverse');
    expect(foilOf(card({ name: 'Mew ex', finish: null }))).toBeNull();
  });
  it('reads PSA variety lines', () => {
    expect(foilOf(card({ variety: 'REVERSE HOLO' }))).toBe('reverse');
    expect(foilOf(card({ variety: 'SPECIAL ART RARE' }))).toBe('fullart');
    expect(foilOf(card({ variety: 'HOLO' }))).toBe('holo');
  });
  it('falls back to the name', () => {
    expect(foilOf(card({ name: 'Umbreon VMAX alt art' }))).toBe('fullart');
    expect(foilOf(card({ name: 'Charizard ex' }))).toBe('holo');
    expect(foilOf(card({ name: 'Pikachu' }))).toBeNull();
  });
});
