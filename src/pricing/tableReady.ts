// What you'd bring to the table, for the Con tab before con mode starts. Pure.

import type { CardRow } from './portfolio';

export type TableReady = {
  /** For sale, priciest ask first. */
  forSale: CardRow[];
  askCents: number;
  floorCents: number;
  tradeOnly: number;
};

export function tableReady(rows: CardRow[]): TableReady {
  const owned = rows.filter((r) => r.card.status === 'owned');
  const forSale = owned.filter((r) => r.card.plan === 'sell').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0));
  return {
    forSale,
    askCents: forSale.reduce((t, r) => t + (r.ask ?? 0), 0),
    floorCents: forSale.reduce((t, r) => t + (r.floor ?? 0), 0),
    tradeOnly: owned.filter((r) => r.card.plan === 'trade').length,
  };
}
