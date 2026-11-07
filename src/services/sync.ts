// Local-first sync with Supabase. The vault and rules live on the phone (works offline at a con);
// every change is pushed, and on sign-in the server copy is pulled. Last write wins per card.

import { cardKey } from '../pricing/cardKey';
import { gameOf } from '../lib/games';
import type { Card, Game, PricingRules } from '../types';
import { supabase } from './supabase';

/** RFC 4122 v4. Card ids must be uuids to match the slabs table. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export type CardRowDb = {
  id: string;
  user_id: string;
  game: Game;
  cert_number: string | null;
  grader: Card['grader'];
  grade: number | null;
  name: string;
  set_name: string | null;
  set_code: string | null;
  number: string | null;
  variety: string | null;
  language: string;
  year: number | null;
  image_front_url: string | null;
  paid_cents: number | null;
  paid_at: string | null;
  plan: Card['plan'];
  floor_override_cents: number | null;
  ask_override_cents: number | null;
  status: Card['status'];
  sold_cents: number | null;
  sold_at: string | null;
  sold_where: string | null;
  condition: string | null;
  created_at: string;
  card_key: string;
};

export function toRow(c: Card, userId: string): CardRowDb {
  return {
    id: c.id,
    user_id: userId,
    game: gameOf(c),
    cert_number: c.certNumber,
    grader: c.grader,
    grade: c.grade,
    name: c.name,
    set_name: c.setName,
    set_code: c.setCode,
    number: c.number,
    variety: c.variety ?? null,
    language: c.language,
    year: c.year,
    image_front_url: c.imageFrontUrl,
    paid_cents: c.paidCents,
    paid_at: c.paidAt,
    plan: c.plan,
    floor_override_cents: c.floorOverrideCents,
    ask_override_cents: c.askOverrideCents,
    status: c.status,
    sold_cents: c.soldCents,
    sold_at: c.soldAt,
    sold_where: c.soldWhere,
    condition: c.condition ?? null,
    created_at: c.createdAt,
    card_key: cardKey(c),
  };
}

export function fromRow(r: CardRowDb): Card {
  return {
    id: r.id,
    game: r.game ?? 'pokemon',
    certNumber: r.cert_number,
    grader: r.grader,
    grade: r.grade == null ? null : Number(r.grade),
    name: r.name,
    setName: r.set_name,
    setCode: r.set_code,
    number: r.number,
    ...(r.variety ? { variety: r.variety } : {}),
    language: r.language ?? 'en',
    year: r.year,
    imageFrontUrl: r.image_front_url,
    paidCents: r.paid_cents,
    paidAt: r.paid_at,
    plan: r.plan,
    floorOverrideCents: r.floor_override_cents,
    askOverrideCents: r.ask_override_cents,
    status: r.status,
    soldCents: r.sold_cents,
    soldAt: r.sold_at,
    soldWhere: r.sold_where,
    ...(r.condition ? { condition: r.condition } : {}),
    createdAt: r.created_at,
  };
}

export function rulesToRow(r: PricingRules, userId: string) {
  return {
    user_id: userId,
    ask_pct: r.askPct,
    floor_pct: r.floorPct,
    never_below_paid: r.neverBelowPaid,
    buy_target_pct: r.buyTargetPct,
    buy_max_pct: r.buyMaxPct,
    round_to_cents: r.roundToCents,
    graded_source: r.gradedSource,
    raw_source: r.rawSource,
  };
}

export function rulesFromRow(r: ReturnType<typeof rulesToRow>): PricingRules {
  return {
    askPct: Number(r.ask_pct),
    floorPct: Number(r.floor_pct),
    neverBelowPaid: r.never_below_paid,
    buyTargetPct: Number(r.buy_target_pct),
    buyMaxPct: Number(r.buy_max_pct),
    roundToCents: r.round_to_cents,
    gradedSource: 'ebay_sold',
    rawSource: 'tcgplayer_market',
  };
}

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function pushCards(cards: Card[]): Promise<void> {
  const uid = await userId();
  if (!supabase || !uid || !cards.length) return;
  await supabase.from('slabs').upsert(cards.filter((c) => isUuid(c.id)).map((c) => toRow(c, uid)));
}

/** Delete slabs on the server. Returns the ids it confirmed, so failed ones are retried later. */
export async function deleteCards(ids: string[]): Promise<string[]> {
  const uid = await userId();
  // Mock seed cards (non-uuid ids) never reached the server; they're done as soon as they're gone.
  const local = ids.filter((id) => !isUuid(id));
  const remote = ids.filter(isUuid);
  if (!supabase || !uid || !remote.length) return local;
  const { error } = await supabase.from('slabs').delete().in('id', remote);
  return error ? local : ids;
}

export async function pushRules(rules: PricingRules): Promise<void> {
  const uid = await userId();
  if (!supabase || !uid) return;
  await supabase.from('pricing_rules').upsert(rulesToRow(rules, uid));
}

/** Server copy of the vault and rules, or null when signed out. */
export async function pull(): Promise<{ cards: Card[]; rules: PricingRules | null } | null> {
  const uid = await userId();
  if (!supabase || !uid) return null;
  const [cards, rules] = await Promise.all([
    supabase.from('slabs').select('*').order('created_at', { ascending: false }),
    supabase.from('pricing_rules').select('*').maybeSingle(),
  ]);
  if (cards.error) return null;
  return {
    cards: (cards.data as CardRowDb[]).map(fromRow),
    rules: rules.data ? rulesFromRow(rules.data) : null,
  };
}

/**
 * Merge after sign-in: server cards win by id; local-only cards (added while signed out) are
 * kept and pushed. Mock seed cards (non-uuid ids) are dropped once a real vault exists.
 * Slabs removed on this phone whose server delete hasn't landed yet stay removed.
 */
export function mergeVault(
  local: Card[],
  remoteAll: Card[],
  removedIds: string[] = [],
): { merged: Card[]; toPush: Card[] } {
  const removed = new Set(removedIds);
  const remote = remoteAll.filter((c) => !removed.has(c.id));
  const remoteIds = new Set(remote.map((c) => c.id));
  const toPush = local.filter((c) => isUuid(c.id) && !remoteIds.has(c.id));
  // Con buys are phone-only notes (not columns yet): keep them on the server's copy.
  const localById = new Map(local.map((c) => [c.id, c]));
  const kept = remote.map((r) => {
    const l = localById.get(r.id);
    return l?.boughtConId ? { ...r, boughtConId: l.boughtConId, boughtMarketCents: l.boughtMarketCents ?? null } : r;
  });
  return { merged: [...toPush, ...kept], toPush };
}
