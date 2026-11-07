// Pricing engine. Pure functions, integer cents in and out. Screens never compute prices;
// they call these. See TECH.md "pricing/rules.ts".

import type { PricingRules } from '../types';

export type Overrides = { floor?: number | null; ask?: number | null };

export type Inputs = {
  marketCents: number;
  low30Cents: number;
  paidCents?: number | null;
  rules: PricingRules;
  overrides?: Overrides;
};

/** Round to the nearest `step` cents, half-up. A step of 0 or 1 means no rounding. */
export function roundTo(cents: number, step: number): number {
  if (!step || step <= 1) return Math.round(cents);
  return Math.floor(cents / step + 0.5) * step;
}

const applyPct = (cents: number, pct: number) => cents * (1 + pct / 100);

/** What to ask: the override, else market × (1 + ask%). */
export function ask(i: Inputs): number {
  if (i.overrides?.ask != null) return i.overrides.ask;
  return roundTo(applyPct(i.marketCents, i.rules.askPct), i.rules.roundToCents);
}

/** Why the floor is what it is, so screens can explain it. */
export type FloorBasis = 'rule' | 'paid' | 'override' | 'ask';

/**
 * The lowest you'll take, and why: the override, else 30-day low × (1 + floor%). When
 * "never sell at a loss" is on, either one is raised to what you paid. Floor never exceeds
 * ask; if it would, floor = ask.
 */
export function floorWithBasis(i: Inputs): { cents: number; basis: FloorBasis } {
  const a = ask(i);
  const overridden = i.overrides?.floor != null;
  let f = overridden ? i.overrides!.floor! : roundTo(applyPct(i.low30Cents, i.rules.floorPct), i.rules.roundToCents);
  let basis: FloorBasis = overridden ? 'override' : 'rule';
  const paid = i.rules.neverBelowPaid ? (i.paidCents ?? 0) : 0;
  if (paid > f) {
    f = paid;
    basis = 'paid';
  }
  if (f > a) return { cents: a, basis: 'ask' };
  return { cents: f, basis };
}

/** The lowest you'll take. See floorWithBasis. */
export function floor(i: Inputs): number {
  return floorWithBasis(i).cents;
}

/** The lowest a per-card floor override can go: what you paid when "never sell at a loss" is on. */
export function minFloorOverride(i: Pick<Inputs, 'paidCents' | 'rules'>): number {
  return i.rules.neverBelowPaid ? (i.paidCents ?? 0) : 0;
}

/** Buying: what to open at. */
export function buyTarget(i: Inputs): number {
  return roundTo(applyPct(i.marketCents, i.rules.buyTargetPct), i.rules.roundToCents);
}

/** Buying: the most you'll pay. Never below the target. */
export function buyMax(i: Inputs): number {
  const max = roundTo(applyPct(i.marketCents, i.rules.buyMaxPct), i.rules.roundToCents);
  return Math.max(max, buyTarget(i));
}

export type OfferVerdict = {
  /** take: at or over floor. counter: under floor but close. pass: far under floor. */
  kind: 'take' | 'counter' | 'pass';
  /** offer − floor. Negative means under floor. */
  delta: number;
  /** The number to counter with. */
  counterAt: number;
};

/** An offer within this fraction under the floor is worth a counter; further under is a pass. */
export const COUNTER_BAND = 0.15;

/**
 * Verdict on a selling offer.
 * - offer ≥ floor → take. counterAt is ask, in case you want to push.
 * - floor × (1 − COUNTER_BAND) ≤ offer < floor → counter at floor.
 * - below that → pass. counterAt is still floor.
 */
export function verdict(offerCents: number, i: Inputs): OfferVerdict {
  const f = floor(i);
  const delta = offerCents - f;
  if (delta >= 0) return { kind: 'take', delta, counterAt: ask(i) };
  if (offerCents >= f * (1 - COUNTER_BAND)) return { kind: 'counter', delta, counterAt: f };
  return { kind: 'pass', delta, counterAt: f };
}

/** eBay final value fee and per-order fee (2026 trading cards category, under $7,500). */
export const EBAY_FVF = 0.1325;
export const EBAY_ORDER_FEE_CENTS = 30;
/**
 * Shipping you'd eat on a slab sold online. Defaults to 0 so the comparison matches the
 * reference screens; a user setting can raise it later.
 */
export const EBAY_SHIP_ESTIMATE_CENTS = 0;

/** What you'd actually keep selling at this price on eBay. */
export function ebayNet(priceCents: number, shippingCents = EBAY_SHIP_ESTIMATE_CENTS): number {
  return Math.round(priceCents * (1 - EBAY_FVF) - EBAY_ORDER_FEE_CENTS - shippingCents);
}

/** All four numbers for a card at once. */
export function quote(i: Inputs) {
  const f = floorWithBasis(i);
  return { ask: ask(i), floor: f.cents, floorBasis: f.basis, buyTarget: buyTarget(i), buyMax: buyMax(i) };
}

/** An offer more than this many times market is probably a typo. */
export const SANITY_MULTIPLE = 3;

/** True when an offer is so far over market it is probably a typo. */
export function looksLikeTypo(offerCents: number, marketCents: number): boolean {
  return marketCents > 0 && offerCents > marketCents * SANITY_MULTIPLE;
}

/** Offer minus what eBay would net at market. Positive: the table beats eBay. */
export function vsEbay(offerCents: number, marketCents: number): number {
  return offerCents - ebayNet(marketCents);
}

// ── Buying: rate an asking price ─────────────────────────────────────────────────────────────

/** steal ≤ target < good ≤ max < fair ≤ market < over. */
export type BuyRatingKind = 'steal' | 'good' | 'fair' | 'over';

export type BuyRating = {
  kind: BuyRatingKind;
  /** ask − your max. Negative means under it. */
  deltaToMax: number;
  /** ask − market. Negative means under it. */
  deltaToMarket: number;
  /** ask ÷ market, e.g. 0.88. */
  pctOfMarket: number;
  /** What to counter with: your target. */
  counterAt: number;
  /** Far under market: worth checking the slab before paying. */
  suspicious: boolean;
};

export const BUY_RATING_LABEL: Record<BuyRatingKind, string> = {
  steal: 'Steal',
  good: 'Good buy',
  fair: 'Fair',
  over: 'Over market',
};

/** Under half of market is too good: fakes, swapped labels, or a typo. */
export const SUSPICIOUS_FRACTION = 0.5;

/** Rate an asking price against your buying rules (target, max) and the market for that grade. */
export function buyRating(askCents: number, p: { targetCents: number; maxCents: number; marketCents: number }): BuyRating {
  const kind: BuyRatingKind =
    askCents <= p.targetCents ? 'steal' : askCents <= p.maxCents ? 'good' : askCents <= p.marketCents ? 'fair' : 'over';
  return {
    kind,
    deltaToMax: askCents - p.maxCents,
    deltaToMarket: askCents - p.marketCents,
    pctOfMarket: p.marketCents > 0 ? askCents / p.marketCents : 0,
    counterAt: p.targetCents,
    suspicious: askCents < p.marketCents * SUSPICIOUS_FRACTION,
  };
}

/**
 * Over a price history, how a fixed price would have rated each day (Steal / Good buy / Fair /
 * Over market), using your buying rules against that day's market. Days without a price are skipped.
 */
export function ratingHistory(
  priceCents: number,
  series: number[],
  limits: (marketCents: number) => { targetCents: number; maxCents: number } | null,
): Record<BuyRatingKind, number> {
  const out: Record<BuyRatingKind, number> = { steal: 0, good: 0, fair: 0, over: 0 };
  for (const m of series) {
    if (!(m > 0)) continue;
    const l = limits(m);
    if (!l) continue;
    out[buyRating(priceCents, { ...l, marketCents: m }).kind]++;
  }
  return out;
}
