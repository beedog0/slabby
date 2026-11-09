// The Search tab's discovery feed (0031_search_landing.sql): top movers up and down, new sealed,
// a daily sealed pick, and sets on the move. One call per game; the last good answer is kept on
// the phone so the landing still has something at a con with no signal. Without Supabase the
// mock catalog stands in.

import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogJson from '../mocks/catalog.json';
import type { Game } from '../types';
import { sealedOf } from './search';
import type { Found } from './searchFilters';
import { supabase } from './supabase';

/** A catalog item with how much it moved and over how many nights (1–7). */
export type Mover = Found & { change: number; days: number; thenCents: number | null };

export type HotSet = {
  groupId: number;
  setName: string;
  game: Game;
  language: string;
  /** Median move of its $5+ cards, or null for a "newest sets" fallback. */
  change: number | null;
  days: number | null;
  why: 'hot' | 'new';
  topName: string | null;
  topImage: string | null;
  topCents: number | null;
};

export type Landing = {
  up: Mover[];
  down: Mover[];
  sealedNew: Found[];
  sealedPick: Found[];
  sets: HotSet[];
  asOf: string | null;
};

export const EMPTY_LANDING: Landing = { up: [], down: [], sealedNew: [], sealedPick: [], sets: [], asOf: null };

type ItemRow = {
  product_id: number;
  game: Game;
  language: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set_name: string;
  set_code: string | null;
  image_url: string | null;
  market_cents: number | null;
  low_cents: number | null;
  change_7d: number | null;
  change_30d: number | null;
  sealed_type: string | null;
  change?: number;
  days?: number;
  then_cents?: number | null;
};

type SetRow = {
  group_id: number;
  set_name: string;
  game: Game;
  language: string;
  change: number | null;
  days: number | null;
  why: 'hot' | 'new';
  top_name: string | null;
  top_image: string | null;
  top_cents: number | null;
};

const found = (r: ItemRow): Found => ({
  productId: r.product_id,
  game: r.game,
  language: r.language,
  name: r.name,
  number: r.number,
  rarity: r.rarity,
  setName: r.set_name,
  setCode: r.set_code,
  imageUrl: r.image_url || null,
  marketCents: r.market_cents,
  lowCents: r.low_cents,
  change7d: r.change_7d ?? null,
  change30d: r.change_30d ?? null,
  sealedType: sealedOf(r.sealed_type),
  aka: [],
});

const mover = (r: ItemRow): Mover => ({ ...found(r), change: r.change ?? 0, days: r.days ?? 7, thenCents: r.then_cents ?? null });

/** Pure: the server's JSON to app types, dropping anything malformed. */
export function landingFrom(j: unknown): Landing {
  const o = (j ?? {}) as Record<string, unknown>;
  const list = <T,>(k: string): T[] => (Array.isArray(o[k]) ? (o[k] as T[]) : []);
  return {
    up: list<ItemRow>('up').filter((r) => r?.product_id).map(mover),
    down: list<ItemRow>('down').filter((r) => r?.product_id).map(mover),
    sealedNew: list<ItemRow>('sealed_new').filter((r) => r?.product_id).map(found),
    sealedPick: list<ItemRow>('sealed_pick').filter((r) => r?.product_id).map(found),
    sets: list<SetRow>('sets')
      .filter((s) => s?.group_id)
      .map((s) => ({
        groupId: s.group_id,
        setName: s.set_name,
        game: s.game,
        language: s.language,
        change: s.change ?? null,
        days: s.days ?? null,
        why: s.why === 'hot' ? 'hot' : 'new',
        topName: s.top_name ?? null,
        topImage: s.top_image || null,
        topCents: s.top_cents ?? null,
      })),
    asOf: typeof o.as_of === 'string' ? o.as_of : null,
  };
}

/** True when there's nothing to show (an old server, or a game with no data yet). */
export function isEmptyLanding(l: Landing): boolean {
  return !l.up.length && !l.down.length && !l.sealedNew.length && !l.sealedPick.length && !l.sets.length;
}

const cacheKey = (game: Game | null) => `slabby.landing.${game ?? 'all'}`;

/** The last good feed saved on this phone, for an instant first paint and offline use. */
export async function cachedLanding(game: Game | null): Promise<Landing | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(game));
    return raw ? landingFrom(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Fresh from the server; throws when offline or the server doesn't have the feed yet. */
export async function fetchLanding(game: Game | null): Promise<Landing> {
  if (!supabase) return mockLanding(game);
  const { data, error } = await supabase.rpc('search_landing', { game_filter: game });
  if (error) throw error;
  AsyncStorage.setItem(cacheKey(game), JSON.stringify(data)).catch(() => {});
  return landingFrom(data);
}

// ── mocks ────────────────────────────────────────────────────────────────────────────────────

type MockRow = Omit<Found, 'change7d' | 'change30d' | 'sealedType' | 'aka'> & { sealedType?: string | null };

function mockLanding(game: Game | null): Landing {
  const all = (catalogJson as MockRow[]).filter((c) => (!game || c.game === game) && !c.sealedType && (c.marketCents ?? 0) >= 2000);
  const asFound = (c: MockRow): Found => ({ ...c, change7d: null, change30d: null, sealedType: sealedOf(c.sealedType ?? null), aka: [] });
  // Fixed, made-up moves so the sections render the same every time.
  const moves = all.map((c, i) => ({ ...asFound(c), change: [0.18, -0.12, 0.09, -0.07, 0.31, -0.04, 0.05][i % 7], days: 7, thenCents: null }));
  const bySet = new Map<string, MockRow[]>();
  for (const c of all) bySet.set(c.setName, [...(bySet.get(c.setName) ?? []), c]);
  return {
    up: moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change),
    down: moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change),
    sealedNew: [],
    sealedPick: [],
    sets: [...bySet.entries()].slice(0, 5).map(([name, cards], i) => {
      const top = [...cards].sort((a, b) => (b.marketCents ?? 0) - (a.marketCents ?? 0))[0];
      return {
        groupId: 9000 + i,
        setName: name,
        game: top.game,
        language: top.language,
        change: [0.06, 0.04, 0.03, 0.02, 0.01][i],
        days: 7,
        why: 'hot' as const,
        topName: top.name,
        topImage: top.imageUrl,
        topCents: top.marketCents,
      };
    }),
    asOf: null,
  };
}
