// Comps refresh state for one card screen: auto-refresh when stale (Slab detail), pull to
// refresh (forced). The screen shows the state through freshnessLine; nothing overlays.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefreshState } from '../pricing/trend';
import { usePrices } from '../store/prices';
import type { Card } from '../types';
import { cardKey } from '../pricing/cardKey';
import { canRefresh, isStale, refreshCard, type RefreshStatus } from './comps';

export function useCardRefresh(card: Card | undefined, opts: { auto?: boolean } = {}) {
  const [state, setState] = useState<RefreshState>('idle');
  const [pulling, setPulling] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      if (!card || !canRefresh()) return;
      setState('refreshing');
      const status: RefreshStatus = await refreshCard(card, { force });
      if (alive.current) setState(status === 'failed' ? 'failed' : 'idle');
    },
    [card],
  );

  const key = card ? cardKey(card) : null;
  useEffect(() => {
    if (!opts.auto || !card || !key || !canRefresh()) return;
    if (!isStale(usePrices.getState().byKey[key]?.refreshedAt)) return;
    run(false);
    // Once per card on open, not on every price update.
  }, [key, opts.auto]);

  const pull = useCallback(async () => {
    setPulling(true);
    await run(true);
    if (alive.current) setPulling(false);
  }, [run]);

  return { state, pulling, pull };
}
