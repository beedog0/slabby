// art-hash: fingerprint catalog card art so a photo can find its card without reading text
// (0016_card_art.sql, _shared/art-hash.ts). Each call claims a batch of cards not yet hashed,
// downloads their TCGplayer image (the small 200 px one), trims its white margin and stores the
// two perceptual hashes and colour grid. pg_cron calls it every 20 seconds while cards are
// waiting. Spends no PokemonPriceTracker credits; TCGplayer's CDN is the image source the app
// already shows.
//
// Edge Functions get about 2 s of CPU per call. JPEG decoding is the cost (a few ms per image),
// so the run stops decoding after CPU_BUDGET_MS and hands the rest of its claim back.

import { createClient } from 'npm:@supabase/supabase-js@2';
import jpeg from 'npm:jpeg-js@0.4.4';
import { artPrint, trimMargin } from '../_shared/art-hash.ts';

const BATCH = Number(Deno.env.get('ART_HASH_BATCH') ?? 90);
const CPU_BUDGET_MS = 1300;
const PARALLEL = 12;
const UA = { 'User-Agent': 'slabby-art-hash/0.1 (+https://github.com/beedog0/slabby)' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

/** The 200 px wide version of a TCGplayer product image. */
export const smallImage = (url: string) =>
  url.replace(/_(?:\d+w|in_\d+x\d+)\.jpg$/, '_200w.jpg').replace(/^(https:\/\/assets\.tcgdex\.net\/.*)\/high\.(?:jpg|png|webp)$/, '$1/low.jpg');

async function allowed(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const cronToken = req.headers.get('x-cron-token');
  if (cronToken) return (await admin.rpc('check_cron_token', { token: cronToken })).data === true;
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  return !!token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!(await allowed(req, admin))) return json({ error: 'Forbidden' }, 403);

  const { data: todo, error } = await admin.rpc('claim_art_batch', { n: BATCH });
  if (error) return json({ error: error.message }, 500);
  const rows = (todo ?? []) as { product_id: number; image_url: string; alt?: boolean }[];

  let cpu = 0;
  let hashed = 0;
  const failed: number[] = [];
  // TCGplayer has no picture yet (403 AccessDenied, or an empty 200): not worth retrying for days.
  const missing: number[] = [];
  const missingAlt: number[] = [];
  const released: number[] = [];
  const out: Record<string, unknown>[] = [];

  // Downloads overlap (they cost no CPU); decoding runs one at a time against the budget.
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const row = rows[next++];
      if (cpu > CPU_BUDGET_MS) {
        released.push(row.product_id);
        continue;
      }
      let bytes: Uint8Array | null = null;
      try {
        const res = await fetch(smallImage(row.image_url), { headers: UA });
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
        if ((res.ok && !bytes?.length) || res.status === 403 || res.status === 404) {
          (row.alt ? missingAlt : missing).push(row.product_id);
          continue;
        }
      } catch {
        bytes = null;
      }
      if (!bytes) {
        failed.push(row.product_id);
        continue;
      }
      if (cpu > CPU_BUDGET_MS) {
        released.push(row.product_id);
        continue;
      }
      const t = performance.now();
      try {
        const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 64 });
        const p = artPrint(trimMargin({ data: img.data, width: img.width, height: img.height }));
        out.push({ product_id: row.product_id, face: p.face, art: p.art, color: p.color, image_url: row.image_url, hashed_at: new Date().toISOString(), claimed_at: null });
        hashed++;
      } catch {
        failed.push(row.product_id);
      } finally {
        cpu += performance.now() - t;
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  if (out.length) {
    const { error: e } = await admin.from('catalog_art').upsert(out, { onConflict: 'product_id' });
    if (e) return json({ error: e.message }, 500);
  }
  // No picture on TCGplayer: parked; claim_art_batch looks again after a few days (0019).
  if (missing.length || missingAlt.length) {
    const now = new Date().toISOString();
    // tries 4: the backup picture (0022) is missing too; the 3-day look tries TCGplayer's again.
    await admin.from('catalog_art').upsert(
      [...missing.map((product_id) => ({ product_id, tries: 3, claimed_at: now })), ...missingAlt.map((product_id) => ({ product_id, tries: 4, claimed_at: now }))],
      { onConflict: 'product_id' },
    );
  }
  // Not reached this run: back in the queue without counting as a try.
  if (released.length) {
    await admin.rpc('release_art_claims', { ids: released });
  }
  return json({ claimed: rows.length, hashed, failed: failed.length, missing: missing.length, missingAlt: missingAlt.length, released: released.length, cpuMs: Math.round(cpu) });
});
