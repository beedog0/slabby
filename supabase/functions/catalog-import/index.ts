// catalog-import: copy TCGplayer's catalog and market prices (via TCGCSV, free) into `catalog`
// for card search. Each call does one batch of sets so it stays inside Edge Function limits;
// pg_cron calls it every 2 minutes after TCGCSV's nightly refresh (0008_card_search.sql) until
// every set is done for the day. Uses no PokemonPriceTracker credits.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CATEGORIES, catalogRows, packPrice, type TcgPrice, type TcgProduct } from '../_shared/catalog-math.ts';
import { pictureIndex, setKeys, tcgdexLang, tcgdexPicture, type TcgdexSet, type TcgdexSetBrief } from '../_shared/alt-images.ts';

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

  // 3. Every set done for today: spend the rest of the night's runs on backup pictures for cards
  //    TCGplayer has no picture for (0021_catalog_alt_images.sql). Never fails the import.
  let pictures: Record<string, unknown> | null = null;
  if (!todo?.length || left === 0) {
    try {
      pictures = await fillAltImages(admin);
    } catch (e) {
      pictures = { error: (e as Error).message };
    }
  }
  return json({ sets: todo?.length ?? 0, cards, setsLeft: left ?? null, failed, pictures });
});

const TCGDEX = 'https://api.tcgdex.net/v2';
const ALT_BATCH = 300;

async function tcgdex<T>(path: string): Promise<T | null> {
  const res = await fetch(`${TCGDEX}${path}`, { headers: UA });
  return res.ok ? ((await res.json()) as T) : null;
}

/**
 * One batch of cards with no TCGplayer picture: same-set printing first, then TCGdex by set code
 * + number, then the same card in another set. image_url is never written.
 */
async function fillAltImages(admin: ReturnType<typeof createClient>) {
  const { data: cleared } = await admin.rpc('clear_found_alt_images');
  const { data: claimed, error } = await admin.rpc('claim_alt_image_batch', { n: ALT_BATCH });
  if (error) throw error;
  const rows = (claimed ?? []) as { product_id: number; game: string; language: string; number: string | null; set_code: string | null }[];
  if (!rows.length) return { cleared, looked: 0 };

  const { data: sib, error: sibErr } = await admin.rpc('sibling_alt_images', { ids: rows.map((r) => r.product_id) });
  if (sibErr) throw sibErr;
  const siblings = new Map(((sib ?? []) as { product_id: number; image_url: string; source: string }[]).map((s) => [s.product_id, s]));

  // TCGdex: only the sets these cards are in, one set list per language.
  const sets = new Map<string, Map<string, Map<string, string>>>(); // lang → set code → pictures
  for (const lang of ['en', 'ja']) {
    const wanted = new Set(
      rows
        .filter((r) => r.game === 'pokemon' && tcgdexLang(r.language) === lang && siblings.get(r.product_id)?.source !== 'same_set')
        .map((r) => (r.set_code ?? '').trim().toUpperCase())
        .filter(Boolean),
    );
    if (!wanted.size) continue;
    // Japanese set ids are the set codes; English sets are found by their official abbreviation
    // (a substring filter, so setKeys checks it exactly). "PR" is every promo/kit and too vague.
    const briefs =
      lang === 'ja'
        ? ((await tcgdex<TcgdexSetBrief[]>(`/ja/sets`)) ?? []).filter((s) => wanted.has(s.id.toUpperCase()))
        : (
            await Promise.all(
              [...wanted].filter((k) => k !== 'PR').map((k) => tcgdex<TcgdexSetBrief[]>(`/en/sets?abbreviation.official=${encodeURIComponent(k)}`)),
            )
          ).flatMap((l) => (l ?? []).slice(0, 4));
    const byCode = new Map<string, Map<string, string>>();
    const ids = [...new Set(briefs.map((s) => s.id))];
    for (let i = 0; i < ids.length; i += 12) {
      const got = await Promise.all(ids.slice(i, i + 12).map((id) => tcgdex<TcgdexSet>(`/${lang}/sets/${encodeURIComponent(id)}`)));
      for (const set of got) {
        if (!set) continue;
        for (const k of setKeys(set, lang)) {
          if (!wanted.has(k)) continue;
          byCode.set(k, new Map([...(byCode.get(k) ?? []), ...pictureIndex(set)]));
        }
      }
    }
    sets.set(lang, byCode);
  }

  const found: { product_id: number; url: string; source: string }[] = [];
  const by: Record<string, number> = { same_set: 0, tcgdex: 0, other_set: 0 };
  for (const r of rows) {
    const s = siblings.get(r.product_id);
    let pick: { url: string; source: string } | null = s?.source === 'same_set' ? { url: s.image_url, source: 'same_set' } : null;
    if (!pick && r.game === 'pokemon') {
      const lang = tcgdexLang(r.language);
      const url = lang ? tcgdexPicture(sets.get(lang) ?? new Map(), r) : null;
      if (url) pick = { url, source: 'tcgdex' };
    }
    if (!pick && s) pick = { url: s.image_url, source: s.source };
    if (pick) {
      found.push({ product_id: r.product_id, ...pick });
      by[pick.source]++;
    }
  }
  if (found.length) {
    const { error: saveErr } = await admin.rpc('save_alt_images', { rows: found });
    if (saveErr) throw saveErr;
  }
  return { cleared, looked: rows.length, found: found.length, ...by };
}
