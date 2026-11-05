import { CODE128_PATTERNS, code128B } from '../code128';

describe('code128B', () => {
  it('has 107 unique symbols that each span 11 modules (stop 13)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((s, d) => s + Number(d), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });

  it('encodes start, data, checksum and stop', () => {
    // (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 55
    const bars = code128B('PJJ123C');
    expect(bars.slice(0, 6).join('')).toBe('211214');
    expect(bars.slice(-7).join('')).toBe('2331112');
    const check = bars.slice(-13, -7).join('');
    expect(check).toBe(CODE128_PATTERNS[55]);
  });

  it('returns nothing for an empty cert', () => {
    expect(code128B('')).toEqual([]);
  });
});
