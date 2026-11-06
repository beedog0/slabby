// One PokemonPriceTracker call for a product, written for every card_key that shares it:
// price_daily rows plus the freshness columns on card_refs (0007_comps_freshness.sql).
// Used by comps-nightly, card-match (first comps) and comps-refresh.

import type { createClient } from 'npm:@supabase/supabase-js@2';
import { gradeKey, gradedDaily, lastRawDay, lastSaleDay, rawDaily, type DailySales, type LastSale } from './comps-math.ts';
import { fetchComps } from './ppt.ts';

type Admin = ReturnType<typeof createClient>;

export type RefreshResult = {
  rows: number;
  refreshedAt: string;
  /** Per card_key: latest sale (graded) or latest market point (raw). */
  lastSale: Record<string, LastSale | null>;
};

/**
 * Fetch comps for one TCGplayer product (3 credits) and write them for `keys`. Throws on the
 * PPT call or a price_daily write (PPT 429 → 'ppt_rate_limited'). A failed freshness write is
 * logged, not thrown, so prices still land before the 0007 columns are deployed.
 */
export async function refreshProduct(
  admin: Admin,
  tcgPlayerId: string,
  language: string,
  keys: string[],
  today = new Date().toISOString().slice(0, 10),
): Promise<RefreshResult> {
  const card = await fetchComps(tcgPlayerId, language);
  const refreshedAt = new Date().toISOString();
  const lastSale: Record<string, LastSale | null> = {};
  let written = 0;
  for (const key of keys) {
    const [grader, grade] = key.split(':');
    const gk = gradeKey(grader, grade ? Number(grade) : null);
    let rows;
    if (gk) {
      const sales = (card.ebay?.priceHistory?.[gk] ?? {}) as DailySales;
      rows = gradedDaily(sales, today);
      lastSale[key] = lastSaleDay(sales);
    } else {
      const points = card.priceHistory?.conditions?.['Near Mint']?.history ?? [];
      rows = rawDaily(points, today);
      lastSale[key] = lastRawDay(points);
    }
    if (rows.length) {
      const { error } = await admin.from('price_daily').upsert(rows.map((r) => ({ card_key: key, ...r })));
      if (error) throw error;
      written += rows.length;
    }
    const { error: refErr } = await admin
      .from('card_refs')
      .update({
        comps_refreshed_at: refreshedAt,
        last_sale_day: lastSale[key]?.day ?? null,
        last_sale_cents: lastSale[key]?.cents ?? null,
      })
      .eq('card_key', key);
    if (refErr) console.error(`card_refs freshness ${key}: ${refErr.message}`);
  }
  return { rows: written, refreshedAt, lastSale };
}
