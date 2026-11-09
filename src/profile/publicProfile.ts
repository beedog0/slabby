// What other people see of you: your profile, a few numbers, and the slabs you choose to show.
// Pure. Built on the phone from your vault, then published (src/services/friends.ts) to the
// showcases table, which only the people you allow can read (0030_friends.sql).
//
// Never on it: what you paid, gains, asks and floors, sold prices, or cert numbers (a real cert
// number is what a fake slab needs). Market value only when you turn it on.

import { arrange, type SortKey } from '../pricing/arrange';
import type { CardRow } from '../pricing/portfolio';
import type { Card } from '../types';

export type ShowcaseOrder = 'value' | 'mine' | 'newest' | 'grade';

export const ORDER_LABEL: Record<ShowcaseOrder, string> = {
  value: 'Top value',
  mine: 'Pinned, then my order',
  newest: 'Newest',
  grade: 'Best grades',
};

export const ORDERS: ShowcaseOrder[] = ['value', 'mine', 'grade', 'newest'];

/** Who can open your collection. Your name, @handle and photo are always findable. */
export type Audience = 'everyone' | 'friends' | 'nobody';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone',
  friends: 'Friends',
  nobody: 'Only me',
};

/** Most slabs a showcase carries: eight shelves of three. */
export const SHOWCASE_MAX = 24;

export type PublicCard = Pick<
  Card,
  'id' | 'game' | 'grader' | 'grade' | 'name' | 'setName' | 'setCode' | 'number' | 'variety' | 'language' | 'year' | 'imageFrontUrl' | 'finish' | 'artColor' | 'condition'
> & {
  /** Market value, only when the owner shows values. */
  valueCents?: number | null;
};

export type PublicStats = {
  /** Owned cards, graded and raw. */
  owned: number;
  graded: number;
  /** The top grade held and how many of it, e.g. 10 and 4. */
  topGrade: number | null;
  topGradeCount: number;
  sets: number;
  /** Only when the owner shows values. */
  valueCents: number | null;
};

export type Showcase = { stats: PublicStats; cards: PublicCard[] };

export type PublicProfile = {
  userId: string;
  handle: string;
  name: string;
  bio: string;
  photo: string | null;
  /** Null when you can't see their collection (friends only, or private). */
  showcase: Showcase | null;
  audience: Audience;
};

export type ShowcaseOptions = {
  order: ShowcaseOrder;
  showValue: boolean;
  /** Home's own shelf order and pin, used by 'mine'. */
  shelfOrder?: string[];
  pinnedId?: string | null;
  max?: number;
};

const owned = (rows: CardRow[]) => rows.filter((r) => r.card.status === 'owned');

/** Owned rows in the showcase order. */
export function orderShowcase(rows: CardRow[], opts: ShowcaseOptions): CardRow[] {
  const mine = owned(rows);
  if (opts.order === 'grade') {
    const rank = (r: CardRow) => (r.card.grader === 'raw' || r.card.grade == null ? -1 : r.card.grade);
    return [...mine].sort((a, b) => rank(b) - rank(a) || (b.price?.marketCents ?? 0) - (a.price?.marketCents ?? 0));
  }
  const sort: SortKey = opts.order === 'mine' ? 'mine' : opts.order;
  return arrange(mine, {
    sort,
    order: opts.shelfOrder,
    pinnedId: opts.order === 'mine' ? opts.pinnedId : null,
  });
}

export function toPublicCard(r: CardRow, showValue: boolean): PublicCard {
  const c = r.card;
  const out: PublicCard = {
    id: c.id,
    game: c.game,
    grader: c.grader,
    grade: c.grade,
    name: c.name,
    setName: c.setName,
    setCode: c.setCode,
    number: c.number,
    variety: c.variety ?? null,
    language: c.language,
    year: c.year,
    imageFrontUrl: c.imageFrontUrl,
    finish: c.finish ?? null,
    artColor: c.artColor,
    condition: c.condition,
  };
  if (showValue) out.valueCents = r.price?.marketCents ?? null;
  return out;
}

export function publicStats(rows: CardRow[], showValue: boolean): PublicStats {
  const mine = owned(rows);
  const grades = mine.filter((r) => r.card.grader !== 'raw' && r.card.grade != null).map((r) => r.card.grade!);
  const topGrade = grades.length ? Math.max(...grades) : null;
  const sets = new Set(mine.map((r) => r.card.setName?.trim().toLowerCase()).filter(Boolean));
  return {
    owned: mine.length,
    graded: mine.filter((r) => r.card.grader !== 'raw').length,
    topGrade,
    topGradeCount: topGrade == null ? 0 : grades.filter((g) => g === topGrade).length,
    sets: sets.size,
    valueCents: showValue ? mine.reduce((s, r) => s + (r.price?.marketCents ?? 0), 0) : null,
  };
}

export function buildShowcase(rows: CardRow[], opts: ShowcaseOptions): Showcase {
  const cards = orderShowcase(rows, opts)
    .slice(0, opts.max ?? SHOWCASE_MAX)
    .map((r) => toPublicCard(r, opts.showValue));
  return { stats: publicStats(rows, opts.showValue), cards };
}

/** A public card as a Card, so SlabView can draw it. Everything private is blank. */
export function asCard(p: PublicCard): Card {
  return {
    ...p,
    certNumber: null,
    paidCents: null,
    paidAt: null,
    plan: 'hold',
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: '1970-01-01T00:00:00Z',
  };
}

/** "4× PSA 10" style line for the top grade, or null with no graded cards. */
export function topGradeText(s: PublicStats): string | null {
  if (s.topGrade == null) return null;
  return `${s.topGradeCount}× ${s.topGrade % 1 ? s.topGrade.toFixed(1) : s.topGrade}`;
}

/** A link that opens a profile in Slabby. */
export const profileLink = (handle: string) => `slabby://u/${handle}`;

/** The handle in a scanned or pasted profile link, or null. */
export function handleFromLink(text: string): string | null {
  const m = text.trim().match(/^(?:slabby:\/\/u\/|https?:\/\/(?:www\.)?slabby\.app\/u\/|@)([a-z0-9_.]{3,20})\/?$/i);
  return m ? m[1].toLowerCase() : null;
}
