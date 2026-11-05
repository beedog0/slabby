// Mount once at the root. Pulls the server vault on sign-in, then pushes every local change.

import { useEffect } from 'react';
import { useRules } from '../store/rules';
import { useVault } from '../store/vault';
import { supabase } from './supabase';
import { mergeVault, pull, pushCards, pushRules } from './sync';

export function useSync() {
  useEffect(() => {
    if (!supabase) return;
    let ready = false;

    const onSignIn = async () => {
      const remote = await pull();
      if (!remote) return;
      const { merged, toPush } = mergeVault(useVault.getState().cards, remote.cards);
      useVault.setState({ cards: merged });
      if (remote.rules) useRules.setState({ rules: remote.rules });
      else await pushRules(useRules.getState().rules);
      await pushCards(toPush);
      ready = true;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') onSignIn().catch(() => {});
      if (event === 'SIGNED_OUT') ready = false;
    });

    const unVault = useVault.subscribe((s, prev) => {
      if (!ready || s.cards === prev.cards) return;
      const before = new Map(prev.cards.map((c) => [c.id, c]));
      pushCards(s.cards.filter((c) => before.get(c.id) !== c)).catch(() => {});
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
