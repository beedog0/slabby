// Light, dark, or follow the phone. Per-device preference, persisted on the phone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AppearanceMode = 'system' | 'light' | 'dark';

type AppearanceState = {
  mode: AppearanceMode;
  setMode: (m: AppearanceMode) => void;
};

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'slabby-appearance', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
