import { DEFAULT_RULES, type PricingRules } from '../../types';
import { ask, buyMax, buyTarget, ebayNet, floor, floorWithBasis, looksLikeTypo, minFloorOverride, roundTo, verdict, vsEbay, type Inputs } from '../rules';

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
  it('uses the override', () => {
    expect(floor(base({ overrides: { floor: $(110) } }))).toBe($(110));
  });
  it('raises an override under paid to paid when never-sell-at-a-loss is on', () => {
    expect(floor(base({ overrides: { floor: $(90) } }))).toBe($(95));
    expect(floor(base({ overrides: { floor: $(90) } }, { neverBelowPaid: false }))).toBe($(90));
  });
  it('says why the floor is what it is', () => {
    expect(floorWithBasis(base()).basis).toBe('rule');
    expect(floorWithBasis(base({ paidCents: $(140) })).basis).toBe('paid');
    expect(floorWithBasis(base({ overrides: { floor: $(110) } })).basis).toBe('override');
    expect(floorWithBasis(base({ overrides: { floor: $(500) } })).basis).toBe('ask');
  });
  it('limits the override stepper to paid only when the rule is on', () => {
    expect(minFloorOverride({ paidCents: $(95), rules: DEFAULT_RULES })).toBe($(95));
    expect(minFloorOverride({ paidCents: $(95), rules: { ...DEFAULT_RULES, neverBelowPaid: false } })).toBe(0);
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

describe('offer helpers', () => {
  it('flags offers over 3× market as likely typos', () => {
    expect(looksLikeTypo($(451), $(150))).toBe(true);
    expect(looksLikeTypo($(450), $(150))).toBe(false);
  });
  it('compares an offer with what eBay would net at market', () => {
    // eBay nets $259.95 on $300 market.
    expect(vsEbay($(250), $(300))).toBe(-995);
    expect(vsEbay($(270), $(300))).toBe(1005);
  });
});
