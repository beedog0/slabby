import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { conSummary, rowFor } from '../portfolio';
import { elapsed } from '../../lib/format';

const all = cards as Card[];
const start = '2026-11-05T10:00:00.000Z';

describe('conSummary', () => {
  it('counts sales since the session started and floors of what is left', () => {
    const sold = all.map((c) =>
      c.name === 'Charizard ex' ? { ...c, status: 'sold' as const, soldCents: 16_000, soldAt: '2026-11-05T11:00:00.000Z' } : c,
    );
    const s = conSummary(sold.map((c) => rowFor(c, DEFAULT_RULES)), start);
    expect(s.soldCents).toBe(16_000);
    expect(s.soldCount).toBe(1);
    expect(s.totalCount).toBe(5);
    // Giratina 250 + Pikachu 80 + Umbreon V 480 + Mewtwo 175
    expect(s.floorTotalCents).toBe(98_500);
  });
  it('ignores sales from before the session', () => {
    const sold = all.map((c, i) => (i === 4 ? { ...c, status: 'sold' as const, soldCents: 1, soldAt: '2026-01-01T00:00:00Z' } : c));
    expect(conSummary(sold.map((c) => rowFor(c, DEFAULT_RULES)), start).soldCount).toBe(0);
  });
});

describe('elapsed', () => {
  it('formats hours and minutes', () => {
    expect(elapsed(start, Date.parse(start) + (3 * 60 + 12) * 60_000)).toBe('3h 12m');
    expect(elapsed(start, Date.parse(start) + 5 * 60_000)).toBe('5m');
  });
});
