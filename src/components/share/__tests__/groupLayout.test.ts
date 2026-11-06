jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
import { groupLayout, MAX_SHARE } from '../ShareCard';

describe('group share card', () => {
  it('picks columns by count and grows taller for more rows', () => {
    expect(groupLayout(2).cols).toBe(2);
    expect(groupLayout(6).cols).toBe(3);
    expect(groupLayout(12).cols).toBe(4);
    expect(groupLayout(2).height).toBe(450); // still a 4:5 post
    expect(groupLayout(MAX_SHARE).height).toBeGreaterThan(groupLayout(9).height);
  });
  it('fits every column inside the canvas', () => {
    for (const n of [2, 4, 5, 9, 10, MAX_SHARE]) {
      const g = groupLayout(n);
      expect(g.cols * g.cellW).toBeLessThanOrEqual(360 - 40);
    }
  });
});
