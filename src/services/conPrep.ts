// Con-day prep: when con mode starts, bring every price you'll need at the table up to date while
// you still have signal, and warm the photo cache. Hall Wi-Fi is bad; the vault and its prices are
// already on the phone, so after this nothing at the table waits on the network.
//
// - Cards on the table (for sale or trade only): a fresh comps pull, skipping any written in the
//   last hour (refreshCards with CON_MIN_AGE_MS).
// - Wishlist: each card's prices (card-prices is cached for a day on the server, so this is cheap),
//   and the market for the grade you want is saved on the wishlist item.
// - Photos for both lists go into the image cache.

import { prefetchArt } from '../components/ArtImage';
import type { Card } from '../types';
import type { WishItem } from '../store/wishlist';
import { CON_MIN_AGE_MS, refreshCards } from './comps';
import { openPrices } from './search';

export type PrepResult = { at: string; failed: boolean };

/** Cards worth having fresh at a con: owned and on the table. */
export function tableCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.status === 'owned' && (c.plan === 'sell' || c.plan === 'trade'));
}

export async function prepCon(
  cards: Card[],
  wish: WishItem[],
  seeMarket: (key: string, marketCents: number, asOf: string) => void,
): Promise<PrepResult> {
  const table = tableCards(cards);
  prefetchArt([...table.map((c) => c.imageFrontUrl), ...wish.map((w) => w.imageUrl)]);
  let failed = false;
  const [statuses] = await Promise.all([
    refreshCards(table, { force: true, minAgeMs: CON_MIN_AGE_MS }).catch(() => table.map(() => 'failed' as const)),
    (async () => {
      let next = 0;
      const worker = async () => {
        while (next < wish.length) {
          const w = wish[next++];
          const p = await openPrices(w.productId).catch(() => null);
          if (!p) {
            failed = true;
            continue;
          }
          const price = w.grade === 'raw' ? p.raw : p.grades[w.grade];
          if (price) seeMarket(w.key, price.marketCents, price.asOf);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    })(),
  ]);
  if (statuses.some((s) => s === 'failed')) failed = true;
  return { at: new Date().toISOString(), failed };
}
