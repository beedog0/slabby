import { DEFAULT_RULES, type PricingRules } from '../../types';
import { ask, buyMax, buyTarget, ebayNet, floor, roundTo, verdict, type Inputs } from '../rules';

const $ = (d: number) => d * 100;
const base = (o: Partial<Inputs> = {}, r: Partial<PricingRules> = {}): Inputs => ({
  marketCents: $(150),
  low30Cents: $(137),
  paidCents: $(95),
  rules: { ...DEFAULT_RULES, ...r },
  ...o,
});

describe('roundTo', () => {
  it('rounds half-up to the step', () => {
    expect(roundTo(12_250, 500)).toBe(12_500);
    expect(roundTo(12_249, 500)).toBe(12_000);
    expect(roundTo(16_500, 500)).toBe(16_500);
  });
  it('treats 0 and 1 as no rounding', () => {
    expect(roundTo(12_345, 0)).toBe(12_345);
    expect(roundTo(12_345.6, 1)).toBe(12_346);
  });
});

describe('ask', () => {
  it('is market +10% by default (reference: Charizard $150 → $165)', () => {
    expect(ask(base())).toBe($(165));
  });
  it('uses the override when set', () => {
    expect(ask(base({ overrides: { ask: $(199) } }))).toBe($(199));
  });
  it('ignores a null override', () => {
    expect(ask(base({ overrides: { ask: null } }))).toBe($(165));
  });
});

describe('floor', () => {
  it('is 30d low −5% rounded (reference: low $137 → $130)', () => {
    expect(floor(base())).toBe($(130));
  });
  it('never drops under paid when never-sell-at-a-loss is on', () => {
    expect(floor(base({ paidCents: $(140) }))).toBe($(140));
  });
  it('can drop under paid when the rule is off', () => {
    expect(floor(base({ paidCents: $(140) }, { neverBelowPaid: false }))).toBe($(130));
  });
  it('treats missing paid as 0', () => {
    expect(floor(base({ paidCents: null }))).toBe($(130));
  });
  it('uses the override even if under paid', () => {
    expect(floor(base({ overrides: { floor: $(90) } }))).toBe($(90));
  });
  it('never exceeds ask', () => {
    expect(floor(base({ paidCents: $(200) }))).toBe($(165));
    expect(floor(base({ overrides: { floor: $(500) } }))).toBe($(165));
  });
});

describe('buying', () => {
  it('target is market −15%, max is market −5%', () => {
    expect(buyTarget(base())).toBe($(130)); // 127.5 → 130 at $5 rounding
    expect(buyMax(base())).toBe($(145)); // 142.5 → 145
  });
  it('max is never below target', () => {
    expect(buyMax(base({}, { buyTargetPct: -5, buyMaxPct: -20 }))).toBe($(145));
  });
});

describe('verdict', () => {
  // Reference Offer screen: floor $250, offer $240 → "$10 under floor", Counter $250.
  const giratina = base({ marketCents: $(280), low30Cents: $(263), paidCents: $(190) });
  it('matches the reference offer', () => {
    expect(floor(giratina)).toBe($(250));
    expect(verdict($(240), giratina)).toEqual({ kind: 'counter', delta: -$(10), counterAt: $(250) });
  });
  it('takes at or above floor', () => {
    expect(verdict($(250), giratina).kind).toBe('take');
    expect(verdict($(300), giratina)).toMatchObject({ kind: 'take', delta: $(50) });
  });
  it('passes well under floor', () => {
    expect(verdict($(200), giratina)).toMatchObject({ kind: 'pass', counterAt: $(250) });
  });
});

describe('ebayNet', () => {
  it('takes 13.25% and $0.30 (reference: comp $280 nets ~$242)', () => {
    expect(ebayNet($(280))).toBe(24_260);
  });
  it('subtracts shipping when given', () => {
    expect(ebayNet($(100), 500)).toBe(8_145);
  });
});
