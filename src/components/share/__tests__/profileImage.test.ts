import { profileImageLayout } from '../ProfileImage';
import { qrPath } from '../../profile/ProfileCode';

test('3 slabs make a 4:5 post, more grow taller', () => {
  expect(profileImageLayout(3).height).toBe(450);
  expect(profileImageLayout(6).height).toBeLessThan(560);
  expect(profileImageLayout(9).height).toBeGreaterThan(560);
  expect(profileImageLayout(9).rows).toBe(3);
});

test('profile code draws a square QR', () => {
  const { d, n } = qrPath('slabby://u/avaslabs');
  expect(n).toBeGreaterThanOrEqual(21);
  expect(d.startsWith('M0 0')).toBe(true); // finder pattern corner
});
