// Mount once at the root. Pulls the server vault on sign-in, then pushes every local change.

import { useEffect } from 'react';
import { useRules } from '../store/rules';
import { useVault } from '../store/vault';
import { supabase } from './supabase';
import { refreshPrices } from './comps';
import { repairCard } from './psa';
import { deleteCards, mergeVault, pull, pushCards, pushRules } from './sync';

export function useSync() {
  useEffect(() => {
    if (!supabase) return;
    let ready = false;

    // Retry server deletes for slabs removed on this phone (offline at a con, or before sign-in).
    const flushRemoved = () => {
      const ids = useVault.getState().removedIds;
      if (ids.length) deleteCards(ids).then((done) => useVault.getState().clearRemoved(done)).catch(() => {});
    };

    const onSignIn = async () => {
      const remote = await pull();
      if (!remote) return;
      const { cards: local, removedIds } = useVault.getState();
      const { merged, toPush } = mergeVault(local, remote.cards, removedIds);
      const repaired = merged.map(repairCard);
      const fixed = repaired.filter((c, i) => c !== merged[i]);
      useVault.setState({ cards: repaired });
      // Last-day prices live only on this phone, so a pull keeps them.
      if (remote.rules) useRules.setState((s) => ({ rules: { ...s.rules, ...remote.rules } }));
      else await pushRules(useRules.getState().rules);
      const stale = repaired.filter((c) => remote.staleKeys.includes(c.id) && !fixed.includes(c));
      await pushCards([...toPush.filter((c) => !fixed.some((f) => f.id === c.id)), ...fixed, ...stale]);
      ready = true;
      flushRemoved();
      // Prices and photos need the session, so load them now rather than only on first render.
      await refreshPrices(useVault.getState().cards);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // No account yet: start a guest session so scans, prices and backup work right away.
      // Signing in with Apple later carries the local vault over (mergeVault pushes it).
      if (event === 'INITIAL_SESSION' && !session) {
        supabase!.auth.signInAnonymously().catch(() => {});
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') onSignIn().catch(() => {});
      if (event === 'SIGNED_OUT') ready = false;
    });

    const unVault = useVault.subscribe((s, prev) => {
      if (!ready || s.cards === prev.cards) return;
      const before = new Map(prev.cards.map((c) => [c.id, c]));
      pushCards(s.cards.filter((c) => before.get(c.id) !== c)).catch(() => {});
      if (s.cards.length < prev.cards.length) flushRemoved();
    });
    const unRules = useRules.subscribe((s, prev) => {
      if (ready && s.rules !== prev.rules) pushRules(s.rules).catch(() => {});
    });

    return () => {
      sub.subscription.unsubscribe();
      unVault();
      unRules();
    };
  }, []);
}
