// Selling a card you just scanned: where your asking price sits against market, and how it does
// against what the card cost you. Pure functions, integer cents. Screens call these; they never
// do the math themselves (CLAUDE.md).
//
// Cost comes from the scan sheet's "What you paid": a number, "Pulled it" (from a pack: the
// pack's TCGplayer price when the catalog has one, else $0), or "Not sure" (no rating).

/** What the card cost you. */
export type Cost =
  | { kind: 'paid'; cents: number }
  | { kind: 'pulled'; packCents: number | null }
  | { kind: 'unknown' };

/** The cost to measure profit from: what you paid, the pack price for a pull (else 0), or null. */
export function costBasis(c: Cost | null | undefined): number | null {
  if (!c) return null;
  if (c.kind === 'paid') return c.cents;
  if (c.kind === 'pulled') return c.packCents ?? 0;
  return null;
}

/** Within this fraction of market reads as "at market" (rounding, a $5 step on a $250 card). */
export const AT_MARKET_BAND = 0.02;
/** Further over market than this, a buyer at a table will counter. */
export const COUNTER_LIKELY = 0.15;
/** Further under market than this, the card is priced to move. */
export const PRICED_TO_MOVE = 0.1;

export type MarketPlace = {
  place: 'at' | 'above' | 'below';
  /** ask − market. */
  deltaCents: number;
  /** (ask − market) ÷ market, e.g. 0.12. */
  pct: number;
};

/** Where an ask sits against market. Null without a market price. */
export function vsMarket(askCents: number, marketCents: number | null | undefined): MarketPlace | null {
  if (marketCents == null || marketCents <= 0) return null;
  const deltaCents = askCents - marketCents;
  const pct = deltaCents / marketCents;
  const place = Math.abs(pct) <= AT_MARKET_BAND ? 'at' : pct > 0 ? 'above' : 'below';
  return { place, deltaCents, pct };
}

/** A profit at or over this fraction of cost is a strong one. */
export const STRONG_PROFIT = 0.3;

/**
 * pure: a pull with no pack price, so every dollar is profit.
 * strong ≥ 30% over cost > profit > even (within $1) > loss. unknown: no cost to measure from.
 */
export type SellRatingKind = 'pure' | 'strong' | 'profit' | 'even' | 'loss' | 'unknown';

export const SELL_RATING_LABEL: Record<SellRatingKind, string> = {
  pure: 'Pure profit',
  strong: 'Strong profit',
  profit: 'Small profit',
  even: 'Break even',
  loss: 'Selling at a loss',
  unknown: 'No cost to rate against',
};

export type SellRating = {
  kind: SellRatingKind;
  /** ask − cost. Null when the cost isn't known. */
  profitCents: number | null;
  /** profit ÷ cost. Null when the cost is unknown or $0. */
  pct: number | null;
  costCents: number | null;
};

/** Rate an asking price against what the card cost you. */
export function sellRating(askCents: number, cost: Cost | null | undefined): SellRating {
  const costCents = costBasis(cost);
  if (costCents == null) return { kind: 'unknown', profitCents: null, pct: null, costCents: null };
  const profitCents = askCents - costCents;
  const pct = costCents > 0 ? profitCents / costCents : null;
  let kind: SellRatingKind;
  if (costCents === 0) kind = cost?.kind === 'pulled' ? 'pure' : profitCents > 0 ? 'strong' : 'even';
  else if (Math.abs(profitCents) < 100) kind = 'even';
  else if (profitCents < 0) kind = 'loss';
  else kind = pct! >= STRONG_PROFIT ? 'strong' : 'profit';
  return { kind, profitCents, pct, costCents };
}

/**
 * The one-line read under the rating, like Key stats: a few short phrases joined with " · ".
 * Plain strings; the screen adds color to the numbers.
 */
export function sellRead(askCents: number, m: MarketPlace | null, floorCents: number | null): string[] {
  const out: string[] = [];
  if (m && m.pct > COUNTER_LIKELY) out.push('Expect counters');
  else if (m && m.pct < -PRICED_TO_MOVE) out.push('Priced to move');
  else if (m) out.push('In line with sales');
  if (floorCents != null && askCents < floorCents) out.push('Under your floor');
  return out;
}
