// Saves everything the phone keeps for you to your account, so it survives a reinstall or a new
// phone: the vault (with fields the slabs table has no column for), wishlist, scan corrections,
// pricing rules, con session, shelf order and appearance. One user_state row per on-device store,
// holding the store's saved JSON as is (0025_user_state.sql).
//
// On a phone that already holds this account's things, the phone is the truth and is pushed.
// Signing in to an account from a phone that holds someone else's (or a guest's) things merges
// both: the account's copy wins where the same item is in both, and the phone's extra items join.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useAppearance } from '../store/appearance';
import { useCon } from '../store/con';
import { useCorrections } from '../store/corrections';
import { useDisplay } from '../store/display';
import { useEstimates } from '../store/estimates';
import { useProfile } from '../store/profile';
import { useRules } from '../store/rules';
import { useTrade } from '../store/trade';
import { useVault } from '../store/vault';
import { useWishlist } from '../store/wishlist';
import { supabase } from './supabase';

type PersistedStore = {
  persist: {
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
  subscribe: (listener: () => void) => () => void;
};

/**
 * The stores saved to the account. Caches the server can rebuild (prices, recent sales, scan
 * reads) stay off this list. When a branch adds a store of your own things (con trades, typed
 * prices), add it here.
 */
export const BACKED_UP: { key: string; store: PersistedStore }[] = [
  { key: 'slabby.vault', store: useVault },
  { key: 'slabby.wishlist', store: useWishlist },
  { key: 'slabby.corrections', store: useCorrections },
  { key: 'slabby.rules', store: useRules },
  { key: 'slabby.con', store: useCon },
  { key: 'slabby.display', store: useDisplay },
  { key: 'slabby-appearance', store: useAppearance },
  { key: 'slabby.trade', store: useTrade },
  { key: 'slabby.estimates', store: useEstimates },
  { key: 'slabby.profile', store: useProfile },
];

/** Resolves once these stores have loaded from the phone, so nothing merges over a blank copy. */
export function hydrated(stores: PersistedStore[] = BACKED_UP.map((b) => b.store)): Promise<void> {
  return Promise.all(
    stores.map(
      (st) =>
        new Promise<void>((resolve) => {
          if (st.persist.hasHydrated()) return resolve();
          const un = st.persist.onFinishHydration(() => {
            un();
            resolve();
          });
        }),
    ),
  ).then(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Merging (pure)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isEmpty = (v: unknown) =>
  v == null || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);

function itemId(v: unknown): string | null {
  if (!isObj(v)) return null;
  const k = v.id ?? v.key;
  return typeof k === 'string' || typeof k === 'number' ? String(k) : null;
}

/** One field of a store: lists join (the account's first), maps join (the account wins). */
export function mergeField(remote: unknown, local: unknown): unknown {
  if (isEmpty(remote)) return isEmpty(local) ? remote ?? local : local;
  if (isEmpty(local)) return remote;
  if (Array.isArray(remote) && Array.isArray(local)) {
    const ided = [...remote, ...local].every((v) => itemId(v) != null);
    if (ided) {
      const seen = new Set(remote.map(itemId));
      return [...remote, ...local.filter((v) => !seen.has(itemId(v)))];
    }
    const plain = [...remote, ...local].every((v) => v == null || typeof v !== 'object');
    if (plain) return [...new Set([...remote, ...local])];
    return remote;
  }
  if (isObj(remote) && isObj(local)) return { ...local, ...remote };
  return remote;
}

/** A store's state from the account merged with this phone's. */
export function mergeState(remote: unknown, local: unknown): unknown {
  if (!isObj(remote)) return local ?? remote;
  if (!isObj(local)) return remote;
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) out[k] = mergeField(remote[k], local[k]);
  // The vault: a card removed on either side stays removed.
  if (Array.isArray(out.cards) && Array.isArray(out.removedIds) && out.removedIds.length) {
    const gone = new Set(out.removedIds as unknown[]);
    out.cards = (out.cards as unknown[]).filter((c) => !gone.has(itemId(c)));
  }
  return out;
}

type Saved = { state?: unknown; version?: number };

/** Two saved copies of a store ({ state, version } as zustand writes it) merged into one. */
export function mergeSaved(remote: Saved | null, local: Saved | null): Saved | null {
  if (!remote) return local;
  if (!local) return remote;
  // Keep this build's version, so the store doesn't throw away a copy written by another build.
  return { state: mergeState(remote.state, local.state), version: local.version ?? remote.version };
}

function parse(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return isObj(v) ? (v as Saved) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Server

const lastSent = new Map<string, string>();

/** Push stores that changed since the last push. Resolves to the count saved; throws on failure. */
export async function pushState(uid: string, keys = BACKED_UP.map((b) => b.key)): Promise<number> {
  if (!supabase) return 0;
  const rows: { user_id: string; key: string; value: unknown }[] = [];
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null || lastSent.get(`${uid}:${key}`) === raw) continue;
    const value = parse(raw);
    if (value) rows.push({ user_id: uid, key, value });
  }
  if (!rows.length) return 0;
  const { error } = await supabase.from('user_state').upsert(rows);
  if (error) throw new Error(error.message);
  for (const r of rows) lastSent.set(`${uid}:${r.key}`, JSON.stringify(r.value));
  return rows.length;
}

/** Bring the account's copy onto this phone, merged with what's here, and reload the stores. */
export async function restoreState(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('user_state').select('key, value');
  if (error) throw new Error(error.message);
  const remote = new Map((data ?? []).map((r: { key: string; value: Saved }) => [r.key, r.value]));
  for (const { key, store } of BACKED_UP) {
    const theirs = remote.get(key) ?? null;
    if (!theirs) continue;
    const merged = mergeSaved(theirs, parse(await AsyncStorage.getItem(key)));
    if (!merged) continue;
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    await store.persist.rehydrate();
  }
  lastSent.clear();
}

/**
 * Keep the account up to date: push a couple of seconds after any change, and right away when
 * the app goes to the background. Returns a stop function.
 */
export function watchState(uid: string, report: (r: { ok: true } | { ok: false; error: string }) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pushState(uid)
      .then(() => report({ ok: true }))
      .catch((e: Error) => report({ ok: false, error: e.message }));
  };
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 2000);
  };
  const subs = BACKED_UP.map(({ store }) => store.subscribe(soon));
  const app = AppState.addEventListener('change', (s) => {
    if (s !== 'active' && timer) flush();
  });
  flush();
  return () => {
    if (timer) clearTimeout(timer);
    subs.forEach((u) => u());
    app.remove();
  };
}
