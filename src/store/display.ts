// How the collection home is shown. Per-device preference, persisted on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SortKey } from '../pricing/arrange';
import type { CollectionFilter } from '../pricing/portfolio';

export type DisplayMode = 'shelf' | 'scroll' | 'grid';
/** Card search results: rows or a two-across grid of card photos. */
export type SearchLayout = 'list' | 'grid';

type DisplayState = {
  mode: DisplayMode;
  filter: CollectionFilter;
  sort: SortKey;
  /** Card ids in the order the user arranged their shelf. */
  order: string[];
  /** One favorite that shows first in every view. */
  pinnedId: string | null;
  setMode: (m: DisplayMode) => void;
  setFilter: (f: CollectionFilter) => void;
  setSort: (s: SortKey) => void;
  setOrder: (o: string[]) => void;
  setPinned: (id: string | null) => void;
  searchLayout: SearchLayout;
  setSearchLayout: (l: SearchLayout) => void;
};

export const useDisplay = create<DisplayState>()(
  persist(
    (set) => ({
      mode: 'shelf',
      filter: 'all',
      sort: 'value',
      order: [],
      pinnedId: null,
      setMode: (mode) => set({ mode }),
      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
      setOrder: (order) => set({ order }),
      setPinned: (pinnedId) => set({ pinnedId }),
      searchLayout: 'list',
      setSearchLayout: (searchLayout) => set({ searchLayout }),
    }),
    // New fields fall back to the defaults above when an older saved state is loaded.
    { name: 'slabby.display', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
