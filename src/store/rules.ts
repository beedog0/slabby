import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { lastDayEnd } from '../pricing/rules';
import { DEFAULT_RULES, type PricingRules } from '../types';

type RulesState = {
  rules: PricingRules;
  set: (patch: Partial<PricingRules>) => void;
  reset: () => void;
  /** Last-day prices on until midnight tonight. */
  startLastDay: (now?: number) => void;
  stopLastDay: () => void;
};

export const useRules = create<RulesState>()(
  persist(
    (set) => ({
      rules: DEFAULT_RULES,
      set: (patch) => set((s) => ({ rules: { ...s.rules, ...patch } })),
      reset: () => set({ rules: DEFAULT_RULES }),
      startLastDay: (now) => set((s) => ({ rules: { ...s.rules, lastDayUntil: lastDayEnd(now) } })),
      stopLastDay: () => set((s) => ({ rules: { ...s.rules, lastDayUntil: null } })),
    }),
    {
      name: 'slabby.rules',
      storage: createJSONStorage(() => AsyncStorage),
      // Rules saved before a setting existed pick up its default.
      merge: (saved, current) => ({ ...current, rules: { ...DEFAULT_RULES, ...((saved as Partial<RulesState>)?.rules ?? {}) } }),
    },
  ),
);
