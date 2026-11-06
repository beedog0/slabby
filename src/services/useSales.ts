// Recent sales for one card and window: the cached answer at once, then the server's.

import { useCallback, useEffect, useRef, useState } from 'react';
import { cardKey } from '../pricing/cardKey';
import { useSalesCache } from '../store/sales';
import type { Card, SalesResult } from '../types';
import { loadSales, type SalesDays } from './sales';

export type SalesState = 'loading' | 'ready' | 'failed';

export function useSales(card: Card | undefined, days: SalesDays) {
  const key = card ? cardKey(card) : null;
  const cached = useSalesCache((s) => (key ? s.byKey[`${key}|${days}`] : undefined));
  const [fresh, setFresh] = useState<{ id: string; result: SalesResult } | null>(null);
  const [state, setState] = useState<SalesState>('loading');
  const run = useRef(0);

  const load = useCallback(async () => {
    if (!card) return;
    const id = `${cardKey(card)}|${days}`;
    const mine = ++run.current;
    setState('loading');
    try {
      const result = await loadSales(card, days);
      if (mine !== run.current) return;
      setFresh({ id, result });
      setState('ready');
    } catch {
      if (mine === run.current) setState('failed');
    }
  }, [card, days]);

  useEffect(() => {
    load();
    return () => {
      run.current++;
    };
  }, [key, days]);

  const id = key ? `${key}|${days}` : null;
  const result = fresh && fresh.id === id ? fresh.result : (cached?.result ?? null);
  return { result, fetchedAt: cached?.fetchedAt ?? null, state, reload: load };
}
