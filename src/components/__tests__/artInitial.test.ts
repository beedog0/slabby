import { cardInitial } from '../ArtImage';

describe('cardInitial', () => {
  it('takes the first letter of the card name', () => {
    expect(cardInitial('Lugia V - 2023 (Gabriel Fernandez)')).toBe('L');
    expect(cardInitial('(Mirror) ex')).toBe('E');
    expect(cardInitial('ルギア')).toBe('ル');
    expect(cardInitial('')).toBeNull();
    expect(cardInitial(null)).toBeNull();
  });
});
