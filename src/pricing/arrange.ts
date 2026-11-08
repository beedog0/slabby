// How the collection home orders and narrows what it shows: search, sort, the user's own
// shelf order, and one pinned favorite that always comes first. Pure; screens call these.

import { gradeLabel, rowTitle } from '../lib/format';
import { cardKey } from './cardKey';
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

/** Move one id to a new index in a list, the rest keep their relative order. */
export function moveTo(list: string[], id: string, to: number): string[] {
  const from = list.indexOf(id);
  if (from < 0) return list;
  const next = list.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}

/**
 * Saved shelf order after a drag: `dropped` is the shown list in its new order. Slabs hidden by
 * the current tab or search keep their places after it, as with swapOrder.
 */
export function dropOrder(order: string[], dropped: string[]): string[] {
  const seen = new Set(dropped);
  return [...dropped, ...order.filter((id) => !seen.has(id))];
}

/** Which shelf slot a point falls in, for a grid of `cols` slots `step` apart, rows `pitch` apart. */
export function slotAt(
  x: number,
  y: number,
  g: { cols: number; inset: number; step: number; pitch: number; count: number },
): number {
  const col = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.inset) / g.step)));
  const row = Math.max(0, Math.floor(y / g.pitch));
  return Math.max(0, Math.min(g.count - 1, row * g.cols + col));
}

/**
 * Identical raw singles (same card, condition, status and plan) collapse into one row that carries
 * `copies`, shown as a "2x" badge. The first copy keeps its place in the order. Graded slabs never
 * stack: each has its own cert.
 */
export function stackCopies(rows: CardRow[]): CardRow[] {
  const firstOf = new Map<string, number>();
  const out: CardRow[] = [];
  for (const r of rows) {
    const c = r.card;
    const key = stackKey(c);
    if (key == null) {
      out.push(r);
      continue;
    }
    const at = firstOf.get(key);
    if (at == null) {
      firstOf.set(key, out.length);
      out.push({ ...r, copies: 1 });
    } else {
      out[at] = { ...out[at], copies: (out[at].copies ?? 1) + 1 };
    }
  }
  return out;
}

/** What makes two raw singles (or sealed copies) one stack on home. Graded slabs never stack: null. */
export function stackKey(c: CardRow['card']): string | null {
  if (c.grader !== 'raw') return null;
  return [cardKey(c), c.name, c.condition ?? '', c.status, c.plan].join('|');
}

/** Every card in `cards` that stacks with `card` on home, `card` first. Just `card` for a slab. */
export function copiesOf<T extends CardRow['card']>(cards: T[], card: T): T[] {
  const key = stackKey(card);
  if (key == null) return [card];
  return [card, ...cards.filter((c) => c.id !== card.id && stackKey(c) === key)];
}
