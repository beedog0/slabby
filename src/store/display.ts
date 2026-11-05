// How the collection home is shown. Per-device preference, persisted on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CollectionFilter } from '../pricing/portfolio';

export type DisplayMode = 'shelf' | 'scroll' | 'grid';

type DisplayState = {
  mode: DisplayMode;
  filter: CollectionFilter;
  setMode: (m: DisplayMode) => void;
  setFilter: (f: CollectionFilter) => void;
};

export const useDisplay = create<DisplayState>()(
  persist(
    (set) => ({
      mode: 'shelf',
      filter: 'all',
      setMode: (mode) => set({ mode }),
      setFilter: (filter) => set({ filter }),
    }),
    { name: 'slabby.display', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
