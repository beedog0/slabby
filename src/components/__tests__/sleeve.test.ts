import { scanAspect } from '../slab/Sleeve';

describe('scanAspect', () => {
  it('takes the scan’s own shape so wide older scans keep their border', () => {
    expect(scanAspect(716, 1000)).toBeCloseTo(1.397, 3);
    expect(scanAspect(745, 1000)).toBeCloseTo(1.342, 3);
  });
  it('falls back to a card shape and clamps odd images', () => {
    expect(scanAspect(0, 0)).toBeCloseTo(88 / 63, 5);
    expect(scanAspect(1000, 1000)).toBe(1.25);
    expect(scanAspect(400, 1000)).toBe(1.5);
  });
});
