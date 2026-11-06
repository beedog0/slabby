// How the collection home is shown. Per-device preference, persisted on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CollectionFilter } from '../pricing/portfolio';

export type DisplayMode = 'shelf' | 'scroll' | 'grid';
/** Card search results: rows or a two-across grid of card photos. */
export type SearchLayout = 'list' | 'grid';

type DisplayState = {
  mode: DisplayMode;
  filter: CollectionFilter;
  setMode: (m: DisplayMode) => void;
  setFilter: (f: CollectionFilter) => void;
  searchLayout: SearchLayout;
  setSearchLayout: (l: SearchLayout) => void;
};

export const useDisplay = create<DisplayState>()(
  persist(
    (set) => ({
      mode: 'shelf',
      filter: 'all',
      setMode: (mode) => set({ mode }),
      setFilter: (filter) => set({ filter }),
      searchLayout: 'grid',
      setSearchLayout: (searchLayout) => set({ searchLayout }),
    }),
    { name: 'slabby.display', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
