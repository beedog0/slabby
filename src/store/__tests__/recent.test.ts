jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import type { Found } from '../../services/searchFilters';
import { pushQuery, pushViewed } from '../recent';

describe('recent searches', () => {
  it('keeps newest first, unique regardless of case, capped', () => {
    let l: string[] = [];
    for (const q of ['umbreon', 'Moonbreon', 'UMBREON ', 'x', 'pikachu']) l = pushQuery(l, q, 3);
    expect(l).toEqual(['pikachu', 'UMBREON', 'Moonbreon']);
  });
});

describe('recently viewed', () => {
  it('keeps one per card, newest first', () => {
    const c = (id: number) => ({ productId: id }) as Found;
    let l = [c(1), c(2)];
    l = pushViewed(l, c(2));
    expect(l.map((x) => x.productId)).toEqual([2, 1]);
  });
});
