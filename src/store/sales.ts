// Last recent-sales answer per card_key and window, persisted so the sales screen shows something
// with no signal on the show floor.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SalesResult } from '../types';

export type CachedSales = { result: SalesResult; fetchedAt: string };

type SalesState = {
  byKey: Record<string, CachedSales>;
  put: (key: string, entry: CachedSales) => void;
};

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function validSale(r: unknown): boolean {
  return obj(r) && typeof r.source === 'string' && typeof r.listingId === 'string' && day(r.soldDay) && num(r.priceCents);
}

function validDay(r: unknown): boolean {
  return obj(r) && day(r.day) && num(r.sales) && num(r.avgCents);
}

/** A cache entry this build can draw: a known kind, a rows array of the right shape, a time. */
export function validEntry(e: unknown): e is CachedSales {
  if (!obj(e) || typeof e.fetchedAt !== 'string' || !obj(e.result)) return false;
  const r = e.result;
  if (r.kind === 'none') return true;
  if (!Array.isArray(r.rows)) return false;
  if (r.kind === 'sales') return r.rows.every(validSale);
  if (r.kind === 'daily') return r.rows.every(validDay);
  return false;
}

/** byKey with malformed entries dropped. */
export function cleanByKey(byKey: unknown): Record<string, CachedSales> {
  if (!obj(byKey)) return {};
  return Object.fromEntries(Object.entries(byKey).filter(([, e]) => validEntry(e))) as Record<string, CachedSales>;
}

export const useSalesCache = create<SalesState>()(
  persist(
    (set) => ({
      byKey: {},
      put: (key, entry) => set((s) => ({ byKey: { ...(s.byKey ?? {}), [key]: entry } })),
    }),
    {
      name: 'slabby.sales',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ byKey: s.byKey }),
      // v1: drop entries an earlier build wrote in another shape (bare results, missing rows).
      migrate: (state) => ({ byKey: cleanByKey((state as { byKey?: unknown } | null)?.byKey) }),
    },
  ),
);
