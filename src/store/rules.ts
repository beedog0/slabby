import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_RULES, type PricingRules } from '../types';

type RulesState = {
  rules: PricingRules;
  set: (patch: Partial<PricingRules>) => void;
  reset: () => void;
};

export const useRules = create<RulesState>()(
  persist(
    (set) => ({
      rules: DEFAULT_RULES,
      set: (patch) => set((s) => ({ rules: { ...s.rules, ...patch } })),
      reset: () => set({ rules: DEFAULT_RULES }),
    }),
    { name: 'slabby.rules', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
