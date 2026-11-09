import { shelfImageLayout } from '../ShelfImage';
import { qrPath } from '../../profile/ProfileCode';

test('a few slabs make a square; more shelves grow taller; one across is the biggest slab', () => {
  expect(shelfImageLayout(3, 3).height).toBe(360);
  expect(shelfImageLayout(9, 3).rows).toBe(3);
  expect(shelfImageLayout(9, 3).height).toBeGreaterThan(shelfImageLayout(6, 3).height);
  expect(shelfImageLayout(1, 1).slabW).toBe(200);
  expect(shelfImageLayout(2, 2).slabW).toBeGreaterThan(shelfImageLayout(3, 3).slabW);
  expect(shelfImageLayout(3, 3, true).height).toBeGreaterThanOrEqual(shelfImageLayout(3, 3).height);
});

test('profile code draws a square QR', () => {
  const { d, n } = qrPath('slabby://u/avaslabs');
  expect(n).toBeGreaterThanOrEqual(21);
  expect(d.startsWith('M0 0')).toBe(true);
});
