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

/**
 * The lowest you'll take: the override, else 30-day low × (1 + floor%), raised to what you
 * paid when "never sell at a loss" is on. Floor never exceeds ask; if it would, floor = ask.
 */
export function floor(i: Inputs): number {
  const a = ask(i);
  let f: number;
  if (i.overrides?.floor != null) {
    f = i.overrides.floor;
  } else {
    const fromRule = roundTo(applyPct(i.low30Cents, i.rules.floorPct), i.rules.roundToCents);
    const paid = i.rules.neverBelowPaid ? (i.paidCents ?? 0) : 0;
    f = Math.max(fromRule, paid);
  }
  return Math.min(f, a);
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
  return { ask: ask(i), floor: floor(i), buyTarget: buyTarget(i), buyMax: buyMax(i) };
}
