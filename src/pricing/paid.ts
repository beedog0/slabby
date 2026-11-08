// Editing what you paid: the keypad's digits in and out, kept pure so the sheet stays simple.
// Whole dollars on the keypad, like every other price you type in Slabby. A price that already has
// cents ($2.50 from a scan) is kept as is unless you type over it.

import type { Card } from '../types';

export const MAX_PAID_DIGITS = 6;

/** The price all of these share, or undefined when they differ. null = none of them has one. */
export function sharedPaid(cards: Pick<Card, 'paidCents'>[]): number | null | undefined {
  if (!cards.length) return null;
  const first = cards[0].paidCents;
  return cards.every((c) => c.paidCents === first) ? first : undefined;
}

/** The keypad's next digits. The first key replaces the starting price instead of adding to it. */
export function nextDigits(digits: string, d: string, fresh: boolean): string {
  if (fresh || digits === '0') return d;
  return digits.length >= MAX_PAID_DIGITS ? digits : digits + d;
}

/** Digits → cents. '' is "not typed"; '0' is "paid nothing" (pulled from a pack, a gift). */
export function digitsToCents(digits: string): number | null {
  return digits ? parseInt(digits, 10) * 100 : null;
}

/** Starting keypad digits for a saved price (rounded to dollars only for display). */
export function centsToDigits(cents: number | null | undefined): string {
  return cents == null ? '' : String(Math.round(cents / 100));
}
