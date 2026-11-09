// What goes on a share image: the profile's cards in the chosen order or your own pick, and the
// wishlist as cards with what you'd pay. Pure.

import { money } from '../lib/format';
import type { CardRow } from '../pricing/portfolio';
import type { WishItem } from '../store/wishlist';
import type { Card } from '../types';
import { asCard, orderShowcase, toPublicCard, type PublicStats, type ShowcaseOptions } from './publicProfile';

/** Most cards a share image holds: three shelves of three. */
export const IMAGE_MAX = 9;

export type ImageOrder = ShowcaseOptions['order'] | 'custom';

/** Your picks, in your order, skipping any card no longer in the vault. */
export function pickedRows(rows: CardRow[], ids: string[]): CardRow[] {
  const byId = new Map(rows.filter((r) => r.card.status === 'owned').map((r) => [r.card.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is CardRow => !!r).slice(0, IMAGE_MAX);
}

/** The profile image's cards: ordered rows, or your own picks. Public fields only. */
export function profileImageCards(
  rows: CardRow[],
  opts: { order: ImageOrder; customIds: string[]; count: number; showValue: boolean; shelfOrder?: string[]; pinnedId?: string | null },
): Card[] {
  const chosen =
    opts.order === 'custom'
      ? pickedRows(rows, opts.customIds)
      : orderShowcase(rows, { order: opts.order, showValue: opts.showValue, shelfOrder: opts.shelfOrder, pinnedId: opts.pinnedId }).slice(0, opts.count);
  return chosen.map((r) => asCard(toPublicCard(r, opts.showValue)));
}

/** "38 slabs · 14 graded 10 · 19 sets", with value first when shown. */
export function statsLine(s: PublicStats): string {
  const g = s.topGrade == null ? null : s.topGrade % 1 ? s.topGrade.toFixed(1) : String(s.topGrade);
  const top = g == null ? null : s.topGradeCount > 1 ? `${s.topGradeCount} graded ${g}` : `best grade ${g}`;
  return [
    s.valueCents != null ? money(s.valueCents) : null,
    `${s.owned} ${s.owned === 1 ? 'slab' : 'slabs'}`,
    top,
    `${s.sets} ${s.sets === 1 ? 'set' : 'sets'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A wishlist card drawn as the slab (or raw card) you're after. */
export function wishCard(w: WishItem): Card {
  const graded = w.grade !== 'raw';
  return {
    id: w.key,
    game: w.game,
    certNumber: null,
    grader: graded ? 'psa' : 'raw',
    grade: graded ? Number(w.grade.slice(3)) : null,
    name: w.name,
    setName: w.setName,
    setCode: null,
    number: w.number,
    language: w.language,
    year: null,
    imageFrontUrl: w.imageUrl,
    paidCents: null,
    paidAt: null,
    plan: 'hold',
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: w.addedAt,
  };
}

/** Your wishlist picks in your order; with none picked, the newest wishlist cards. */
export function wishPicks(items: WishItem[], keys: string[]): WishItem[] {
  if (!keys.length) return items.slice(0, IMAGE_MAX);
  const byKey = new Map(items.map((w) => [w.key, w]));
  return keys.map((k) => byKey.get(k)).filter((w): w is WishItem => !!w).slice(0, IMAGE_MAX);
}

export type WishTitle = 'buying' | 'wishlist';
export const WISH_TITLE: Record<WishTitle, string> = { buying: 'Looking to buy', wishlist: 'Wishlist' };

/** Under each wishlist card: the grade, and what you'd pay when prices show. */
export function wishCaption(w: WishItem, title: WishTitle, showPrices: boolean): string {
  const grade = w.grade === 'raw' ? 'Raw' : `PSA ${w.grade.slice(3)}`;
  if (!showPrices) return grade;
  return `${grade}\n${title === 'buying' ? 'Paying' : 'Up to'} ${money(w.targetCents)}`;
}
