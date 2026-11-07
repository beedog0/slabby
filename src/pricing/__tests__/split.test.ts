import { splitTotal } from '../split';

describe('splitTotal', () => {
  it('splits by market and always adds up', () => {
    expect(splitTotal(30_000, [10_000, 20_000])).toEqual([10_000, 20_000]);
    const parts = splitTotal(10_001, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
  });
  it('gives slabs with no market price nothing when others have one', () => {
    expect(splitTotal(5_000, [5_000, null])).toEqual([5_000, 0]);
  });
  it('splits evenly when no slab has a market price', () => {
    expect(splitTotal(9_000, [null, null, null])).toEqual([3_000, 3_000, 3_000]);
  });
});
