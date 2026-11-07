// catalog-import: copy TCGplayer's catalog and market prices (via TCGCSV, free) into `catalog`
// for card search. Each call does one batch of sets so it stays inside Edge Function limits;
// pg_cron calls it every 2 minutes after TCGCSV's nightly refresh (0008_card_search.sql) until
// every set is done for the day. Uses no PokemonPriceTracker credits.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CATEGORIES, catalogRows, packPrice, type TcgPrice, type TcgProduct } from '../_shared/catalog-math.ts';

const TCGCSV = 'https://tcgcsv.com/tcgplayer';
const UA = { 'User-Agent': 'slabby-catalog-import/0.1 (+https://github.com/beedog0/slabby)' };
const BATCH = 12; // sets per call
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

async function results<T>(path: string): Promise<T[]> {
  const res = await fetch(`${TCGCSV}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`tcgcsv_${res.status} ${path}`);
  return ((await res.json()) as { results: T[] }).results ?? [];
}

/** pg_cron (x-cron-token) or a caller holding the service role key. */
async function allowed(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const cronToken = req.headers.get('x-cron-token');
  if (cronToken) return (await admin.rpc('check_cron_token', { token: cronToken })).data === true;
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  return !!token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!(await allowed(req, admin))) return json({ error: 'Forbidden' }, 403);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Refresh each game's set list once a day (new sets appear here first).
  const { data: cats } = await admin.from('catalog_categories').select('category_id, groups_on');
  const seen = new Map((cats ?? []).map((c) => [c.category_id as number, c.groups_on as string | null]));
  for (const cat of CATEGORIES) {
    if (seen.get(cat.id) === today) continue;
    const groups = await results<{ groupId: number; name: string; abbreviation?: string | null }>(`/${cat.id}/groups`);
    // Keep each set's imported_on; only the name and code are refreshed.
    const { error } = await admin.from('catalog_groups').upsert(
      groups.map((g) => ({ category_id: cat.id, group_id: g.groupId, name: g.name, abbreviation: g.abbreviation ?? null })),
      { onConflict: 'category_id,group_id' },
    );
    if (error) return json({ error: error.message }, 500);
    await admin.from('catalog_categories').upsert({ category_id: cat.id, groups_on: today });
  }

  // 2. The next sets not imported today, oldest first.
  const { data: todo, error } = await admin
    .from('catalog_groups')
    .select('category_id, group_id, name, abbreviation')
    .or(`imported_on.is.null,imported_on.lt.${today}`)
    .order('imported_on', { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  let cards = 0;
  const failed: string[] = [];
  for (const g of todo ?? []) {
    const cat = CATEGORIES.find((c) => c.id === g.category_id)!;
    // One booster pack's price, for "Pulled it" on the sell page (0013_pack_prices.sql).
    let pack: { pack_name?: string | null; pack_cents?: number | null } = {};
    try {
      const [products, prices] = await Promise.all([
        results<TcgProduct>(`/${cat.id}/${g.group_id}/products`),
        results<TcgPrice>(`/${cat.id}/${g.group_id}/prices`),
      ]);
      const rows = catalogRows(cat, { groupId: g.group_id, name: g.name, abbreviation: g.abbreviation }, products, prices).map(
        (r) => ({ ...r, updated_on: today }),
      );
      for (let i = 0; i < rows.length; i += 500) {
        // upsert_catalog (0010) also appends tonight's price to each card's 31-night history.
        const { error: upErr } = await admin.rpc('upsert_catalog', { rows: rows.slice(i, i + 500) });
        if (upErr) throw upErr;
      }
      cards += rows.length;
      const p = packPrice(products, prices);
      pack = { pack_name: p?.name ?? null, pack_cents: p?.cents ?? null };
    } catch (e) {
      failed.push(`${g.category_id}/${g.group_id}: ${(e as Error).message}`);
    }
    // Done for today even on failure, so one bad set can't stall the queue; it retries tomorrow.
    await admin.from('catalog_groups').update({ imported_on: today }).eq('category_id', g.category_id).eq('group_id', g.group_id);
    // Its own write, so a missing pack column (0012 not applied yet) can't stall the queue.
    if ('pack_cents' in pack)
      await admin.from('catalog_groups').update(pack).eq('category_id', g.category_id).eq('group_id', g.group_id);
  }

  const { count: left } = await admin
    .from('catalog_groups')
    .select('group_id', { count: 'exact', head: true })
    .or(`imported_on.is.null,imported_on.lt.${today}`);
  return json({ sets: todo?.length ?? 0, cards, setsLeft: left ?? null, failed });
});
