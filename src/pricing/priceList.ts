// Con mode's price list: every card for sale with its ask and floor, and the math behind editing
// one card's price or the whole table's total. Pure, integer cents. Screens call these.
//
// Editing the total spreads the change across the cards in proportion to their asks. A card never
// goes under its floor: when a cut would push one below, it stops at its floor and the rest of the
// cards carry the difference. The total you type is the total you get, so rounding leftovers land
// on the biggest cards.

import type { Card, PricingRules } from '../types';
import type { CardRow } from './portfolio';
import { inputsFor } from './portfolio';
import { ask as ruleAsk, minFloorOverride, roundTo } from './rules';

export type PriceListItem = {
  row: CardRow;
  askCents: number;
  floorCents: number;
  marketCents: number;
};

export type PriceList = {
  /** Cards with comps, biggest ask first. */
  items: PriceListItem[];
  /** For sale but no comps yet: listed, not counted. */
  unpriced: CardRow[];
  askCents: number;
  floorCents: number;
  marketCents: number;
  /** Cards whose ask was set by hand (here, the sell flow or Before the table). */
  overridden: number;
};

/** The for-sale cards from con mode's rows, with the totals the price list shows. */
export function priceList(rows: CardRow[]): PriceList {
  const items: PriceListItem[] = [];
  const unpriced: CardRow[] = [];
  let askCents = 0, floorCents = 0, marketCents = 0, overridden = 0;
  for (const r of rows) {
    if (r.card.status !== 'owned' || r.card.plan !== 'sell') continue;
    if (!r.price || r.ask == null || r.floor == null) {
      unpriced.push(r);
      continue;
    }
    items.push({ row: r, askCents: r.ask, floorCents: r.floor, marketCents: r.price.marketCents });
    askCents += r.ask;
    floorCents += r.floor;
    marketCents += r.price.marketCents;
    if (r.card.askOverrideCents != null) overridden++;
  }
  items.sort((a, b) => b.askCents - a.askCents || a.row.card.name.localeCompare(b.row.card.name));
  return { items, unpriced, askCents, floorCents, marketCents, overridden };
}

/**
 * New asks that add up to `targetCents`, spread in proportion to the current asks, each rounded to
 * `step` and never under its floor. A target under the sum of floors puts every card at its floor.
 */
export function spreadTotal(items: { askCents: number; floorCents: number }[], targetCents: number, step: number): number[] {
  const n = items.length;
  if (!n) return [];
  const floors = items.map((i) => Math.min(i.floorCents, i.askCents));
  const minTotal = floors.reduce((a, b) => a + b, 0);
  if (targetCents <= minTotal) return floors;

  // Scale the free cards; any that would dip under its floor is pinned there and the rest rescale.
  const pinned = new Array<boolean>(n).fill(false);
  let raw: number[] = items.map((i) => i.askCents);
  for (let pass = 0; pass <= n; pass++) {
    let pinnedSum = 0, freeAsk = 0;
    for (let k = 0; k < n; k++) pinned[k] ? (pinnedSum += floors[k]) : (freeAsk += items[k].askCents);
    if (freeAsk <= 0) break;
    const scale = (targetCents - pinnedSum) / freeAsk;
    raw = items.map((it, k) => (pinned[k] ? floors[k] : it.askCents * scale));
    let changed = false;
    for (let k = 0; k < n; k++) {
      if (!pinned[k] && raw[k] < floors[k]) {
        pinned[k] = true;
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (pinned.every(Boolean)) return floors;

  const s = step > 1 ? step : 1;
  const out = raw.map((r, k) => Math.max(floors[k], roundTo(r, s)));
  let diff = targetCents - out.reduce((a, b) => a + b, 0);

  // Whole steps first, to the cards rounding hurt most (or helped most, going down).
  for (let guard = 0; Math.abs(diff) >= s && guard < n * 4; guard++) {
    let best = -1;
    for (let k = 0; k < n; k++) {
      if (diff < 0 && out[k] - s < floors[k]) continue;
      const gap = raw[k] - out[k];
      if (best < 0 || (diff > 0 ? gap > raw[best] - out[best] : gap < raw[best] - out[best])) best = k;
    }
    if (best < 0) break;
    out[best] += diff > 0 ? s : -s;
    diff += diff > 0 ? -s : s;
  }
  // What's left (under one step) goes on the biggest card that can take it.
  if (diff !== 0) {
    const order = out.map((v, k) => k).sort((a, b) => out[b] - out[a]);
    const k = order.find((i) => out[i] + diff >= floors[i]);
    if (k != null) out[k] += diff;
  }
  return out;
}

/**
 * A total `pct` percent off (or on, when negative) the current one, rounded to the rules' step
 * (whole dollars at least) so every card can land on a round price.
 */
export function discounted(totalCents: number, pct: number, step = 100): number {
  return roundTo(totalCents * (1 - pct / 100), Math.max(step, 100));
}

/** The override to store for an ask: null when it's what the rules would ask anyway. */
export function askOverrideFor(card: Card, row: CardRow, rules: PricingRules, askCents: number): number | null {
  if (!row.price) return askCents;
  const base = ruleAsk({ ...inputsFor(card, row.price, rules), overrides: {} });
  return askCents === base ? null : askCents;
}

/** The lowest ask a card can take by hand: what you paid while "never sell at a loss" is on. */
export function minAsk(card: Card, rules: PricingRules): number {
  return minFloorOverride({ paidCents: card.paidCents, rules });
}

export type AskCheck =
  | { kind: 'ok' }
  /** Under the floor: the floor comes down to match. */
  | { kind: 'floorDrops'; floorCents: number }
  /** Under what you paid with "never sell at a loss" on. */
  | { kind: 'underPaid'; minCents: number };

/** What a typed ask means for a card before saving it. */
export function checkAsk(askCents: number, floorCents: number, minCents: number): AskCheck {
  if (minCents > 0 && askCents < minCents) return { kind: 'underPaid', minCents };
  if (askCents < floorCents) return { kind: 'floorDrops', floorCents: askCents };
  return { kind: 'ok' };
}

export type FloorCheck = { kind: 'ok' } | { kind: 'underPaid'; minCents: number } | { kind: 'overAsk'; askCents: number };

/** A typed floor must sit between what you paid (no-loss on) and the ask. */
export function checkFloor(floorCents: number, askCents: number, minCents: number): FloorCheck {
  if (minCents > 0 && floorCents < minCents) return { kind: 'underPaid', minCents };
  if (floorCents > askCents) return { kind: 'overAsk', askCents };
  return { kind: 'ok' };
}
