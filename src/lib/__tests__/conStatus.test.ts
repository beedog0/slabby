import { conStatusOf, conTabFor, planPatch } from '../conStatus';

describe('conStatus', () => {
  it('reads the four con states from status and plan', () => {
    expect(conStatusOf({ status: 'owned', plan: 'hold' })).toBe('hold');
    expect(conStatusOf({ status: 'owned', plan: 'sell' })).toBe('sale');
    expect(conStatusOf({ status: 'owned', plan: 'trade' })).toBe('trade');
    expect(conStatusOf({ status: 'sold', plan: 'trade' })).toBe('sold');
  });
  it('maps choices to plans and tabs', () => {
    expect(planPatch('sale')).toEqual({ plan: 'sell' });
    expect(planPatch('trade')).toEqual({ plan: 'trade' });
    expect(conTabFor('hold')).toBe('sale');
    expect(conTabFor('trade')).toBe('trade');
    expect(conTabFor('sold')).toBe('sold');
  });
});
