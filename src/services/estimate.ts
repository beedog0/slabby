// "Find a price" for a card with no price source. Calls the price-estimate Edge Function, which
// searches the web for sold listings with an AI model and keeps a week's cache per card_key. The
// answer goes in the estimates store; priceFor() then shows it, labelled, until real comps exist.

import { cardKey } from '../pricing/cardKey';
import { estimateIsFresh, type Estimate } from '../../supabase/functions/_shared/estimate-math';
import { useEstimates, type EstimateEntry } from '../store/estimates';
import { usePrices } from '../store/prices';
import type { Card } from '../types';
import { supabase } from './supabase';

export type FindResult = 'found' | 'none' | 'capped' | 'offline' | 'error';
type Answer = { status: 'found' | 'none' | 'capped' | 'error'; estimate?: Estimate; foundAt?: string; message?: string };

/** Lists read prices through the prices store; poke it so they pick up a new estimate or own price. */
function repaint() {
  usePrices.getState().merge({});
}

/** The card's search result from the last week, if any. */
export function estimateEntry(card: Card, now = Date.now()): EstimateEntry | null {
  const e = useEstimates.getState().byKey[cardKey(card)];
  if (!e) return null;
  const at = e.kind === 'found' ? e.estimate.foundAt : e.foundAt;
  return estimateIsFresh(at, now) ? e : null;
}

const running = new Map<string, Promise<FindResult>>();

/** Search for this card's price. One search per card at a time. Never throws. */
export function findPrice(card: Card): Promise<FindResult> {
  const key = cardKey(card);
  const inFlight = running.get(key);
  if (inFlight) return inFlight;
  const p = run(card, key).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

async function run(card: Card, key: string): Promise<FindResult> {
  if (!supabase) return 'offline';
  try {
    if (!(await supabase.auth.getSession()).data.session) return 'offline';
    const { data, error } = await supabase.functions.invoke<Answer>('price-estimate', {
      body: {
        cardKey: key,
        name: card.name,
        setName: card.setName,
        setCode: card.setCode,
        number: card.number,
        language: card.language,
        grader: card.grader,
        grade: card.grade,
        year: card.year,
        variety: card.variety ?? null,
      },
    });
    if (error || !data) return error && /fetch|network/i.test(String(error.message)) ? 'offline' : 'error';
    if (data.status === 'found' && data.estimate) {
      useEstimates.getState().setEstimate(key, { kind: 'found', estimate: data.estimate });
      repaint();
      return 'found';
    }
    if (data.status === 'none') {
      useEstimates.getState().setEstimate(key, { kind: 'none', foundAt: data.foundAt ?? new Date().toISOString() });
      repaint();
      return 'none';
    }
    return data.status === 'capped' ? 'capped' : 'error';
  } catch {
    return 'offline';
  }
}

/** Your own price for this card (US cents), or null to clear it. */
export function setOwnPrice(card: Card, cents: number | null) {
  useEstimates.getState().setOwn(cardKey(card), cents);
  repaint();
}

export function ownPrice(card: Card): number | null {
  return useEstimates.getState().ownByKey[cardKey(card)] ?? null;
}
