jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../../../modules/label-reader', () => ({ LabelReader: null }));
import { placeLines, tileRects } from '../photoTiles';

describe('tileRects', () => {
  it('covers the whole picture with overlapping pieces', () => {
    const W = 3000;
    const H = 4000;
    const tiles = tileRects(W, H);
    expect(tiles).toHaveLength(6);
    // Every point is in some piece.
    for (let x = 0; x < W; x += 97)
      for (let y = 0; y < H; y += 89) expect(tiles.some((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height)).toBe(true);
    for (const t of tiles) {
      expect(t.x + t.width).toBeLessThanOrEqual(W);
      expect(t.y + t.height).toBeLessThanOrEqual(H);
    }
  });
});

describe('placeLines', () => {
  it('puts a piece’s lines back where they sit on the whole picture', () => {
    const [l] = placeLines([{ text: 'MEP EN 051', x: 0.5, y: 0.5 }], { x: 1000, y: 2000, width: 1000, height: 1000 }, 2000, 4000);
    expect(l).toEqual({ text: 'MEP EN 051', x: 0.75, y: 0.625 });
  });
});
