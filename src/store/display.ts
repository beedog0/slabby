// How the collection home is shown. Per-device preference, persisted on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SortKey } from '../pricing/arrange';
import type { CollectionFilter } from '../pricing/portfolio';
import type { CardPick } from '../lib/games';

export type DisplayMode = 'shelf' | 'scroll' | 'grid';
/** Card search results: rows or a two-across grid of card photos. */
export type SearchLayout = 'list' | 'grid';

type DisplayState = {
  mode: DisplayMode;
  filter: CollectionFilter;
  /** Home's filter button: every card, or one game, or one set in a game. */
  pick: CardPick;
  setPick: (p: CardPick) => void;
  sort: SortKey;
  /** Card ids in the order the user arranged their shelf. */
  order: string[];
  /** One favorite that shows first in every view. */
  pinnedId: string | null;
  /** Slabs per shelf in the shelf view, 1 to 5. */
  perShelf: number;
  setPerShelf: (n: number) => void;
  setMode: (m: DisplayMode) => void;
  setFilter: (f: CollectionFilter) => void;
  setSort: (s: SortKey) => void;
  setOrder: (o: string[]) => void;
  setPinned: (id: string | null) => void;
  searchLayout: SearchLayout;
  setSearchLayout: (l: SearchLayout) => void;
  /** Con mode's Selling list: rows or two slabs across. */
  conLayout: SearchLayout;
  setConLayout: (l: SearchLayout) => void;
  /** Wishlist sheet: card grid (default) or rows. */
  wishLayout: SearchLayout;
  setWishLayout: (l: SearchLayout) => void;
};

export const useDisplay = create<DisplayState>()(
  persist(
    (set) => ({
      mode: 'shelf',
      filter: 'all',
      pick: { game: 'all', set: null },
      setPick: (pick) => set({ pick }),
      sort: 'value',
      order: [],
      pinnedId: null,
      perShelf: 3,
      setPerShelf: (n) => set({ perShelf: Math.max(1, Math.min(5, Math.round(n))) }),
      setMode: (mode) => set({ mode }),
      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
      setOrder: (order) => set({ order }),
      setPinned: (pinnedId) => set({ pinnedId }),
      searchLayout: 'grid',
      setSearchLayout: (searchLayout) => set({ searchLayout }),
      conLayout: 'grid',
      wishLayout: 'grid',
      setWishLayout: (wishLayout) => set({ wishLayout }),
      setConLayout: (conLayout) => set({ conLayout }),
    }),
    // New fields fall back to the defaults above when an older saved state is loaded.
    { name: 'slabby.display', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
