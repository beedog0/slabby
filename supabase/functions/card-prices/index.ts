// card-prices: prices for a card opened from search. Body: { productId }.
// Pokémon: one PokemonPriceTracker call (3 credits) gives raw plus PSA 10 to 1 with history; the
// answer is cached for 24 hours in search_cache and spends from the "search" bucket's own daily
// cap, so browsing can't starve scans or the nightly vault refresh. Other games (and Pokémon once
// the cap is hit with nothing cached) answer with tonight's TCGplayer market from `catalog`.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { hasAllGrades, isFresh, SEARCH_GRADES, summarize, type Summary } from '../_shared/catalog-math.ts';
import { gradedDaily, rawDaily, type DailySales } from '../_shared/comps-math.ts';
import { fetchComps } from '../_shared/ppt.ts';

const CREDITS_PER_OPEN = 3;
const SEARCH_CAP = Number(Deno.env.get('SEARCH_CREDIT_CAP') ?? 5000);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

type Answer = {
  productId: number;
  raw: Summary | null;
  grades: Record<string, Summary | null>;
  fetchedAt: string;
  /** "ppt" = full prices; "catalog" = tonight's raw market only. */
  source: 'ppt' | 'catalog';
  /** True when the search budget for today is spent and graded prices were left out. */
  capped?: boolean;
};

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || !(await admin.auth.getUser(jwt)).data.user) return json({ error: 'Sign in first' }, 401);

  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  if (!Number.isFinite(productId) || productId <= 0) return json({ error: 'Bad request' }, 400);

  const { data: card } = await admin
    .from('catalog')
    .select('product_id, game, language, market_cents, low_cents, updated_on')
    .eq('product_id', productId)
    .maybeSingle();
  if (!card) return json({ error: 'Unknown card' }, 404);

  const fallback = (capped = false): Answer => ({
    productId,
    raw:
      card.market_cents != null
        ? {
            marketCents: card.market_cents,
            lowCents: card.low_cents ?? card.market_cents,
            highCents: card.market_cents,
            sales30d: 0,
            asOf: card.updated_on,
            series90: [card.market_cents],
          }
        : null,
    grades: Object.fromEntries(SEARCH_GRADES.map((g) => [g, null])),
    fetchedAt: new Date().toISOString(),
    source: 'catalog',
    ...(capped ? { capped } : {}),
  });

  // PokemonPriceTracker only covers Pokémon.
  if (card.game !== 'pokemon') return json(fallback());

  const { data: cached } = await admin.from('search_cache').select('payload, fetched_at').eq('product_id', productId).maybeSingle();
  if (cached && isFresh(cached.fetched_at) && hasAllGrades(cached.payload)) return json(cached.payload);

  const ok = (await admin.rpc('claim_ppt_credits', { bucket_name: 'search', n: CREDITS_PER_OPEN, daily_cap: SEARCH_CAP })).data === true;
  if (!ok) return json(cached?.payload ? { ...cached.payload, capped: true } : fallback(true));

  try {
    const comps = await fetchComps(String(productId), card.language);
    const today = new Date().toISOString().slice(0, 10);
    const raw = summarize(rawDaily(comps?.priceHistory?.conditions?.['Near Mint']?.history ?? [], today));
    const grades = Object.fromEntries(
      SEARCH_GRADES.map((g) => [g, summarize(gradedDaily((comps?.ebay?.priceHistory?.[g] ?? {}) as DailySales, today))]),
    );
    const answer: Answer = { productId, raw: raw ?? fallback().raw, grades, fetchedAt: new Date().toISOString(), source: 'ppt' };
    await admin.from('search_cache').upsert({ product_id: productId, payload: answer, fetched_at: answer.fetchedAt });
    return json(answer);
  } catch {
    // PPT down or rate limited: yesterday's answer beats nothing.
    return json(cached?.payload ?? fallback());
  }
});
