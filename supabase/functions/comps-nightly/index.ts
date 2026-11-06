// comps-nightly: for every card_key someone owns, pull 90+ days of comps from PokemonPriceTracker
// and upsert price_daily (TECH.md). Run by pg_cron once a night; also callable by hand with the
// service role key. Graded → eBay/Fanatics sold for that grade; raw → TCGplayer market.
// One Piece and Riftbound aren't on PokemonPriceTracker: raw copies get today's TCGplayer market
// from TCGCSV (history builds up one night at a time); graded copies have no source yet.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, rawToday } from '../_shared/comps-math.ts';
import { refreshProduct } from '../_shared/comps-write.ts';
import { tcgcsvMarket } from '../_shared/tcgcsv.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Callers other than pg_cron (which sends x-cron-token, see 0005_cron.sql). Accepts the legacy
 * service_role key, any of the project's secret keys, or a service_role JWT. JWTs are safe to
 * read here because the gateway has already verified their signature (verify_jwt is on).
 */
function isServiceCaller(header: string | null): boolean {
  const token = header?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  try {
    const secrets = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'));
    if (secrets.includes(token)) return true;
  } catch {
    // Not set on older projects.
  }
  const part = token.split('.')[1];
  if (!part) return false;
  try {
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cronToken = req.headers.get('x-cron-token');
  const fromCron = cronToken ? (await admin.rpc('check_cron_token', { token: cronToken })).data === true : false;
  if (!fromCron && !isServiceCaller(req.headers.get('Authorization'))) return json({ error: 'Forbidden' }, 403);
  const today = new Date().toISOString().slice(0, 10);

  const { data: refs, error } = await admin
    .from('card_refs')
    .select('card_key, game, language, tcgplayer_id, tcgcsv_category, tcgcsv_group')
    .not('tcgplayer_id', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const pokemon = (refs ?? []).filter((r) => (r.game ?? 'pokemon') === 'pokemon');
  const others = (refs ?? []).filter((r) => (r.game ?? 'pokemon') !== 'pokemon');

  // One API call per product; several grades of the same card share it.
  const byProduct = new Map<string, { language: string; keys: string[] }>();
  for (const r of pokemon) {
    const e = byProduct.get(r.tcgplayer_id) ?? { language: r.language, keys: [] };
    e.keys.push(r.card_key);
    byProduct.set(r.tcgplayer_id, e);
  }

  let written = 0;
  const failed: string[] = [];
  for (const [id, { language, keys }] of byProduct) {
    try {
      written += (await refreshProduct(admin, id, language, keys, today)).rows;
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
      if ((e as Error).message === 'ppt_rate_limited') await sleep(61_000);
    }
    await sleep(1100); // stay under 60 calls/minute
  }

  // TCGCSV: one prices file per set covers every card in it (tcgcsvMarket caches it). Raw keys only.
  const raw = others.filter((r) => r.card_key.startsWith('raw:') && r.tcgcsv_category && r.tcgcsv_group);
  for (const r of raw) {
    try {
      const market = await tcgcsvMarket(r.tcgcsv_category, r.tcgcsv_group, r.tcgplayer_id);
      if (market == null) continue;
      const { data: history } = await admin
        .from('price_daily')
        .select('day, market_cents')
        .eq('card_key', r.card_key)
        .gte('day', addDays(today, -30))
        .lt('day', today);
      const row = rawToday(history ?? [], market, today);
      if (!row) continue;
      const { error: upErr } = await admin.from('price_daily').upsert({ card_key: r.card_key, ...row });
      if (upErr) throw upErr;
      written += 1;
    } catch (e) {
      failed.push(`${r.card_key}: ${(e as Error).message}`);
    }
  }
  return json({ products: byProduct.size, tcgcsv: raw.length, rows: written, failed });
});
