// Mount once at the root. Every phone has a session (a guest until you sign in). On sign-in:
// bring the account's saved copy onto the phone when it's an account this phone didn't hold yet,
// merge the slabs table, then save every change (slabs rows + the whole-store copy in user_state).

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getHolder, setHolder, useAccount } from '../store/account';
import { useRules } from '../store/rules';
import { useVault } from '../store/vault';
import { clearGuest, takeLeavingGuest } from './account';
import { BACKED_UP, hydrated, restoreState, watchState } from './backup';
import { supabase } from './supabase';
import { refreshPrices } from './comps';
import { repairCard } from './psa';
import { deleteCards, mergeVault, pull, pushCards, pushRules } from './sync';
import type { Session } from '@supabase/supabase-js';

function who(session: Session | null) {
  const u = session?.user;
  const provider = (u?.app_metadata?.provider as string | undefined) ?? null;
  return {
    uid: u?.id ?? null,
    guest: !u || !!u.is_anonymous,
    email: u?.email || null,
    provider: u && !u.is_anonymous ? provider : null,
  };
}

export function useSync() {
  useEffect(() => {
    if (!supabase) return;
    let ready = false;
    let syncing: string | null = null;
    let stopWatch: (() => void) | null = null;

    const report = (r: { ok: true } | { ok: false; error: string }) =>
      useAccount.setState(
        r.ok ? { saving: false, error: null, savedAt: new Date().toISOString() } : { saving: false, error: r.error },
      );

    // Retry server deletes for slabs removed on this phone (offline at a con, or before sign-in).
    const flushRemoved = () => {
      const ids = useVault.getState().removedIds;
      if (ids.length) deleteCards(ids).then((done) => useVault.getState().clearRemoved(done)).catch(() => {});
    };

    const onSignIn = async (uid: string) => {
      if (syncing === uid) return;
      syncing = uid;
      ready = false;
      stopWatch?.();
      stopWatch = null;
      useAccount.setState({ saving: true });
      await hydrated(BACKED_UP.map((b) => b.store));
      const holder = await getHolder();

      // A guest left for an existing account: its things are on this phone and come along below;
      // clear its server copy so the same slab ids can be saved under the account.
      const left = takeLeavingGuest();
      if (left && left.id !== uid) await clearGuest(left).catch(() => {});

      // An account this phone didn't hold: merge its saved copy in before anything is pushed.
      if (holder !== uid) await restoreState();

      const remote = await pull();
      if (!remote) throw new Error('Couldn’t reach your account');
      const { cards: local, removedIds } = useVault.getState();
      const { merged, toPush } = mergeVault(local, remote.cards, removedIds);
      const repaired = merged.map(repairCard);
      const fixed = repaired.filter((c, i) => c !== merged[i]);
      useVault.setState({ cards: repaired });
      // Last-day prices live only on this phone, so a pull keeps them.
      if (remote.rules && holder !== uid) useRules.setState((s) => ({ rules: { ...s.rules, ...remote.rules } }));
      else await pushRules(useRules.getState().rules);
      // Rows the server never got (or got with an older card_key) go up now. A batch with one bad
      // row used to fail whole and silently; pushCards now saves the rest and counts the misses.
      const stale = repaired.filter((c) => remote.staleKeys.includes(c.id) && !fixed.includes(c));
      const failed = await pushCards([...toPush.filter((c) => !fixed.some((f) => f.id === c.id)), ...fixed, ...stale]);
      if (failed) useAccount.setState({ error: `${failed} card${failed === 1 ? '' : 's'} didn’t save to the slabs list` });

      await setHolder(uid);
      ready = true;
      flushRemoved();
      stopWatch = watchState(uid, report);
      // Prices and photos need the session, so load them now rather than only on first render.
      await refreshPrices(useVault.getState().cards);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      useAccount.setState(who(session));
      // No account yet: start a guest session so scans, prices and saving work right away.
      // Signing in later turns this guest into the account (src/services/account.ts).
      if (event === 'INITIAL_SESSION' && !session) {
        supabase!.auth.signInAnonymously().catch(() => {});
        return;
      }
      if (event === 'SIGNED_OUT') {
        ready = false;
        syncing = null;
        stopWatch?.();
        stopWatch = null;
        return;
      }
      const uid = session?.user.id;
      if (!uid || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION' && event !== 'USER_UPDATED')) return;
      // The SDK runs this callback inside its own lock; start the sync after it returns.
      setTimeout(() => {
        onSignIn(uid).catch((e: Error) => {
          syncing = null;
          useAccount.setState({ saving: false, error: e.message });
        });
      }, 0);
    });

    const unVault = useVault.subscribe((s, prev) => {
      if (!ready || s.cards === prev.cards) return;
      const before = new Map(prev.cards.map((c) => [c.id, c]));
      pushCards(s.cards.filter((c) => before.get(c.id) !== c))
        .then((failed) => failed && useAccount.setState({ error: `${failed} card${failed === 1 ? '' : 's'} didn’t save` }))
        .catch(() => {});
      if (s.cards.length < prev.cards.length) flushRemoved();
    });
    const unRules = useRules.subscribe((s, prev) => {
      if (ready && s.rules !== prev.rules) pushRules(s.rules).catch(() => {});
    });

    // No signal when the app opened (a con hall): try again each time it comes back.
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || ready || syncing) return;
      supabase!.auth.getSession().then(({ data }) => {
        const uid = data.session?.user.id;
        if (uid) onSignIn(uid).catch((e: Error) => {
          syncing = null;
          useAccount.setState({ saving: false, error: e.message });
        });
      });
    });

    return () => {
      app.remove();
      sub.subscription.unsubscribe();
      stopWatch?.();
      unVault();
      unRules();
    };
  }, []);
}
