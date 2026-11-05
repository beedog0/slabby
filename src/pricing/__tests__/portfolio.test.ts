import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { cardKey } from '../cardKey';
import { rowFor, summarize } from '../portfolio';
import { money, pct } from '../../lib/format';

const all = cards as Card[];
const byName = (n: string) => all.find((c) => c.name === n)!;

describe('cardKey', () => {
  it('builds grader:grade:set:number:lang', () => {
    expect(cardKey(byName('Mew ex'))).toBe('psa:10:SV2a:205:ja');
    expect(cardKey(byName('Pikachu ex SAR'))).toBe('raw::SSP:238:en');
  });
});

describe('rowFor', () => {
  it('matches the vault reference row (Mew ex $1,040, +60%)', () => {
    const r = rowFor(byName('Mew ex'), DEFAULT_RULES);
    expect(money(r.price!.marketCents)).toBe('$1,040');
    expect(pct(r.gain!)).toBe('+60%');
  });
  it('matches the con-mode reference row (Charizard ask 165 floor 130)', () => {
    const r = rowFor(byName('Charizard ex'), DEFAULT_RULES);
    expect([r.ask, r.floor]).toEqual([16_500, 13_000]);
  });
  it('respects per-card overrides', () => {
    const c = { ...byName('Charizard ex'), floorOverrideCents: 14_000 };
    expect(rowFor(c, DEFAULT_RULES).floor).toBe(14_000);
  });
});

describe('summarize', () => {
  it('only counts owned cards and sums floors of cards for sale', () => {
    const rows = all.map((c) => rowFor(c, DEFAULT_RULES));
    const s = summarize(rows);
    const owned = rows.reduce((t, r) => t + r.price!.marketCents, 0);
    expect(s.valueCents).toBe(owned);
    expect(s.forSaleCount).toBe(5);

    const sold = rows.map((r, i) => (i === 0 ? { ...r, card: { ...r.card, status: 'sold' as const } } : r));
    expect(summarize(sold).valueCents).toBe(owned - rows[0].price!.marketCents);
  });
});
