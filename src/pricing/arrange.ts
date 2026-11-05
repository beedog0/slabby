// How the collection home orders and narrows what it shows: search, sort, the user's own
// shelf order, and one pinned favorite that always comes first. Pure; screens call these.

import { gradeLabel, rowTitle } from '../lib/format';
import type { CardRow } from './portfolio';

export type SortKey = 'value' | 'gain' | 'newest' | 'name' | 'mine';

export const SORT_LABEL: Record<SortKey, string> = {
  value: 'Value',
  gain: 'Gain',
  newest: 'Newest',
  name: 'Name',
  mine: 'My order',
};

export type ArrangeOptions = {
  sort: SortKey;
  query?: string;
  /** Card ids in the user's shelf order. Ids missing from it go after, newest first. */
  order?: string[];
  pinnedId?: string | null;
};

const valueOf = (r: CardRow) => (r.card.status === 'sold' ? r.card.soldCents ?? 0 : r.price?.marketCents ?? 0);

/** Every word of the query must appear in the card's name, set, number, cert or grade. */
export function matches(r: CardRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const c = r.card;
  const hay = [
    rowTitle(c),
    c.setName,
    c.setCode,
    c.number,
    c.number ? `#${c.number}` : null,
    c.certNumber,
    gradeLabel(c.grader, c.grade, c.condition),
    c.year,
  ]
    .filter((v) => v != null)
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function arrange(rows: CardRow[], opts: ArrangeOptions): CardRow[] {
  const q = opts.query?.trim() ?? '';
  const kept = q ? rows.filter((r) => matches(r, q)) : rows;
  const pos = new Map((opts.order ?? []).map((id, i) => [id, i]));
  const byNewest = (a: CardRow, b: CardRow) => b.card.createdAt.localeCompare(a.card.createdAt);
  const cmp: Record<SortKey, (a: CardRow, b: CardRow) => number> = {
    value: (a, b) => valueOf(b) - valueOf(a),
    gain: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity) || valueOf(b) - valueOf(a),
    newest: byNewest,
    name: (a, b) => rowTitle(a.card).localeCompare(rowTitle(b.card)),
    mine: (a, b) => {
      const pa = pos.get(a.card.id);
      const pb = pos.get(b.card.id);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return byNewest(a, b);
    },
  };
  const sorted = [...kept].sort(cmp[opts.sort]);
  const pin = opts.pinnedId ? sorted.findIndex((r) => r.card.id === opts.pinnedId) : -1;
  if (pin > 0) sorted.unshift(...sorted.splice(pin, 1));
  return sorted;
}

/**
 * Swap two cards in the shelf order. `shown` is the list as currently displayed (already in
 * "My order"), so the saved order becomes exactly what the user sees, with the two swapped.
 */
export function swapOrder(order: string[], shown: string[], a: string, b: string): string[] {
  const seen = new Set(shown);
  const full = [...shown, ...order.filter((id) => !seen.has(id))];
  const i = full.indexOf(a);
  const j = full.indexOf(b);
  if (i < 0 || j < 0 || i === j) return full;
  [full[i], full[j]] = [full[j], full[i]];
  return full;
}
