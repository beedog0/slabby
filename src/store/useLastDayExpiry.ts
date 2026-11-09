// Last-day prices turn themselves off at their end time (midnight), even if the app sat open or in
// the background: a timer while it's open, and a check whenever it comes back to the foreground.
// Clearing the setting changes `rules`, so every ask and floor recalculates.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { lastDayActive } from '../pricing/rules';
import { useRules } from './rules';

export function useLastDayExpiry() {
  const until = useRules((s) => s.rules.lastDayUntil ?? null);
  useEffect(() => {
    if (!until) return;
    const check = () => {
      const { rules, stopLastDay } = useRules.getState();
      if (rules.lastDayUntil && !lastDayActive(rules)) stopLastDay();
    };
    check();
    // setTimeout can't wait longer than ~24.8 days; midnight is always well under that.
    const t = setTimeout(check, Math.max(0, Date.parse(until) - Date.now()) + 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [until]);
}
