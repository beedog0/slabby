import { chunks } from '../comps';

jest.mock('../supabase', () => ({ supabase: null }));

describe('chunks', () => {
  it('splits a vault into request-sized pieces, keeping order', () => {
    const keys = Array.from({ length: 25 }, (_, i) => `k${i}`);
    const parts = chunks(keys, 10);
    expect(parts.map((p) => p.length)).toEqual([10, 10, 5]);
    expect(parts.flat()).toEqual(keys);
  });
  it('gives nothing for nothing', () => {
    expect(chunks([], 10)).toEqual([]);
  });
});
