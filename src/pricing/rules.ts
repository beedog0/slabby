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
  /** The time to judge "last-day prices" against (ms). Defaults to now. */
  now?: number;
};

/** The default cut for last-day prices, in percent. */
export const LAST_DAY_CUT_PCT = 10;

/** True while last-day prices are on: switched on and not yet past their end time. */
export function lastDayActive(rules: PricingRules, now = Date.now()): boolean {
  return !!rules.lastDayUntil && Date.parse(rules.lastDayUntil) > now;
}

/** The cut last-day prices apply right now, in percent (0 when off). */
export function lastDayCut(rules: PricingRules, now = Date.now()): number {
  return lastDayActive(rules, now) ? Math.max(0, rules.lastDayCutPct ?? LAST_DAY_CUT_PCT) : 0;
}

/** When last-day prices switched on now should end: midnight tonight, local time. */
export function lastDayEnd(now = Date.now()): string {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Round to the nearest `step` cents, half-up. A step of 0 or 1 means no rounding. */
export function roundTo(cents: number, step: number): number {
  if (!step || step <= 1) return Math.round(cents);
  return Math.floor(cents / step + 0.5) * step;
}

const applyPct = (cents: number, pct: number) => cents * (1 + pct / 100);

/**
 * What to ask: the override, else market × (1 + ask%). When "never sell at a loss" is on and
 * that rule ask is under what you paid, the ask is raised to paid too (so floor = ask = paid,
 * not a floor quietly clamped back under paid). An ask you set by hand is left alone.
 */
export function askWithBasis(i: Inputs): { cents: number; raisedToPaid: boolean } {
  if (i.overrides?.ask != null) return { cents: i.overrides.ask, raisedToPaid: false };
  const a = roundTo(applyPct(i.marketCents, i.rules.askPct), i.rules.roundToCents);
  const paid = i.rules.neverBelowPaid ? (i.paidCents ?? 0) : 0;
  return paid > a ? { cents: paid, raisedToPaid: true } : { cents: a, raisedToPaid: false };
}

/** What to ask. See askWithBasis. */
export function ask(i: Inputs): number {
  return askWithBasis(i).cents;
}

/** Why the floor is what it is, so screens can explain it. */
export type FloorBasis = 'rule' | 'lastDay' | 'paid' | 'override' | 'ask';

/**
 * The lowest you'll take, and why: the override, else 30-day low × (1 + floor%). While last-day
 * prices are on, a rule floor (never an override) drops by the last-day cut. When "never sell at
 * a loss" is on, either one is raised to what you paid. Floor never exceeds ask; if it would,
 * floor = ask.
 */
export function floorWithBasis(i: Inputs): { cents: number; basis: FloorBasis } {
  const a = ask(i);
  const overridden = i.overrides?.floor != null;
  const cut = overridden ? 0 : lastDayCut(i.rules, i.now);
  let f = overridden
    ? i.overrides!.floor!
    : roundTo(applyPct(i.low30Cents, i.rules.floorPct) * (1 - cut / 100), i.rules.roundToCents);
  let basis: FloorBasis = overridden ? 'override' : cut ? 'lastDay' : 'rule';
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
  return verdictAt(offerCents, floor(i), ask(i));
}

/** The same verdict against a floor and ask you already have (a bundle's totals). */
export function verdictAt(offerCents: number, floorCents: number, askCents: number): OfferVerdict {
  const delta = offerCents - floorCents;
  if (delta >= 0) return { kind: 'take', delta, counterAt: askCents };
  if (offerCents >= floorCents * (1 - COUNTER_BAND)) return { kind: 'counter', delta, counterAt: floorCents };
  return { kind: 'pass', delta, counterAt: floorCents };
}

// ── Bundles: one price for several cards ─────────────────────────────────────────────────────

export type BundleQuote = {
  count: number;
  marketCents: number;
  /** Sum of each card's ask. */
  askCents: number;
  /** The lowest you'll take for all of them together. */
  floorCents: number;
  /** What you paid for all of them (cards with no price paid count as 0). */
  paidCents: number;
  /** paid: the total was raised to what you paid for the lot. */
  floorBasis: 'cards' | 'paid' | 'ask';
};

/**
 * "How much for these three?" Ask is the sum of each card's ask. Floor is the sum of each card's
 * floor before "never sell at a loss", then raised to what you paid for the lot when that rule is
 * on. So a card that's down can be carried by one that's up, but the bundle as a whole never sells
 * at a loss. Never above the ask.
 */
export function bundle(items: Inputs[]): BundleQuote {
  let marketCents = 0, askCents = 0, floorCents = 0, paidCents = 0;
  let neverBelowPaid = false;
  for (const i of items) {
    marketCents += i.marketCents;
    askCents += ask(i);
    floorCents += floor({ ...i, rules: { ...i.rules, neverBelowPaid: false } });
    paidCents += i.paidCents ?? 0;
    neverBelowPaid = neverBelowPaid || i.rules.neverBelowPaid;
  }
  let floorBasis: BundleQuote['floorBasis'] = 'cards';
  if (neverBelowPaid && paidCents > floorCents) {
    floorCents = paidCents;
    floorBasis = 'paid';
  }
  if (floorCents > askCents) {
    floorCents = askCents;
    floorBasis = 'ask';
  }
  return { count: items.length, marketCents, askCents, floorCents, paidCents, floorBasis };
}

// ── Trades: your cards against theirs ────────────────────────────────────────────────────────

/** Within this fraction either way, a trade is even. */
export const TRADE_EVEN_BAND = 0.05;

export type TradeKind = 'even' | 'yours' | 'theirs';

export const TRADE_LABEL: Record<TradeKind, string> = {
  even: 'Even trade',
  yours: 'In your favor',
  theirs: 'In their favor',
};

export type TradeSummary = {
  mineCents: number;
  theirsCents: number;
  /** theirs − mine. Positive: you get more value than you give. */
  gapCents: number;
  /** gap ÷ the larger side, e.g. 0.12. */
  gapPct: number;
  kind: TradeKind;
};

/** Market value on each side and which way the trade leans. */
export function trade(mine: number[], theirs: number[]): TradeSummary {
  const mineCents = mine.reduce((a, b) => a + b, 0);
  const theirsCents = theirs.reduce((a, b) => a + b, 0);
  const gapCents = theirsCents - mineCents;
  const base = Math.max(mineCents, theirsCents);
  const gapPct = base > 0 ? gapCents / base : 0;
  const kind: TradeKind = Math.abs(gapPct) <= TRADE_EVEN_BAND ? 'even' : gapCents > 0 ? 'yours' : 'theirs';
  return { mineCents, theirsCents, gapCents, gapPct, kind };
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
  const a = askWithBasis(i);
  return { ask: a.cents, askRaisedToPaid: a.raisedToPaid, floor: f.cents, floorBasis: f.basis, buyTarget: buyTarget(i), buyMax: buyMax(i) };
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

type PctKey = 'askPct' | 'floorPct' | 'buyTargetPct' | 'buyMaxPct';

/**
 * Pricing rules that can't contradict each other: ask at or above market, floor at or below ask,
 * buy max at or below market, target at or below max. A step that would break one stops at the
 * limit (the other rule is never moved for you).
 */
export function pctLimits(r: Pick<PricingRules, PctKey>, key: PctKey): { min: number; max: number } {
  const far = 100;
  switch (key) {
    case 'askPct':
      return { min: Math.max(0, r.floorPct), max: far };
    case 'floorPct':
      return { min: -far, max: r.askPct };
    case 'buyMaxPct':
      return { min: r.buyTargetPct, max: 0 };
    case 'buyTargetPct':
      return { min: -far, max: r.buyMaxPct };
  }
}

export function clampPct(r: Pick<PricingRules, PctKey>, key: PctKey, value: number): number {
  const { min, max } = pctLimits(r, key);
  return Math.min(max, Math.max(min, value));
}

/** "above market" / "below market" / "at market" for a rule's sign. */
export function pctWord(v: number, of: string): string {
  return `${v > 0 ? 'above' : v < 0 ? 'below' : 'at'} ${of}`;
}
