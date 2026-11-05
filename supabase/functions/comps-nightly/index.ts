// comps-nightly: for every card_key someone owns, pull 90+ days of comps from PokemonPriceTracker
// and upsert price_daily (TECH.md). Run by pg_cron once a night; also callable by hand with the
// service role key. Graded → eBay/Fanatics sold for that grade; raw → TCGplayer market.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { gradeKey, gradedDaily, rawDaily, type DailySales } from '../_shared/comps-math.ts';
import { fetchComps } from '../_shared/ppt.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (req.headers.get('Authorization') !== `Bearer ${service}`) return json({ error: 'Forbidden' }, 403);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, service);
  const today = new Date().toISOString().slice(0, 10);

  const { data: refs, error } = await admin
    .from('card_refs')
    .select('card_key, language, tcgplayer_id')
    .not('tcgplayer_id', 'is', null);
  if (error) return json({ error: error.message }, 500);

  // One API call per product; several grades of the same card share it.
  const byProduct = new Map<string, { language: string; keys: string[] }>();
  for (const r of refs ?? []) {
    const e = byProduct.get(r.tcgplayer_id) ?? { language: r.language, keys: [] };
    e.keys.push(r.card_key);
    byProduct.set(r.tcgplayer_id, e);
  }

  let written = 0;
  const failed: string[] = [];
  for (const [id, { language, keys }] of byProduct) {
    try {
      const card = await fetchComps(id, language);
      for (const key of keys) {
        const [grader, grade] = key.split(':');
        const gk = gradeKey(grader, grade ? Number(grade) : null);
        const rows = gk
          ? gradedDaily((card.ebay?.priceHistory?.[gk] ?? {}) as DailySales, today)
          : rawDaily(card.priceHistory?.conditions?.['Near Mint']?.history ?? [], today);
        if (!rows.length) continue;
        const { error: upErr } = await admin
          .from('price_daily')
          .upsert(rows.map((r) => ({ card_key: key, ...r })));
        if (upErr) throw upErr;
        written += rows.length;
      }
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
      if ((e as Error).message === 'ppt_rate_limited') await sleep(61_000);
    }
    await sleep(1100); // stay under 60 calls/minute
  }
  return json({ products: byProduct.size, rows: written, failed });
});
