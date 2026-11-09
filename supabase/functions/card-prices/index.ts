// card-prices: prices for a card opened from search. Body: { productId }.
// Pokémon: one PokemonPriceTracker call (3 credits) gives raw plus PSA 10 to 1 with history; the
// answer is cached for 24 hours in search_cache and spends from the "search" bucket's own daily
// cap, so browsing can't starve scans or the nightly vault refresh. Other games (and Pokémon once
// the cap is hit with nothing cached) answer with tonight's TCGplayer market from `catalog`.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { ANSWER_VERSION, denseHistory, extendHistory, hasAllGrades, isFresh, lastSale, realDays, SEARCH_GRADES, summarize, withPoints, type Summary } from '../_shared/catalog-math.ts';
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
  /** ANSWER_VERSION; 2 adds hist/histFrom (180 days) and lastSale. */
  v?: number;
};

const HISTORY_DAYS = 180;

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

  // Weekly TCGplayer market back to Feb 2024 (raw_price_weekly), for the 1Y / All chart.
  const { data: weekly } = await admin.from('raw_price_weekly').select('from_day, cents').eq('product_id', productId).maybeSingle();
  const longRaw = (raw: Summary | null): Summary | null => {
    if (!raw) return raw;
    const ext = extendHistory(raw.hist && raw.histFrom ? { histFrom: raw.histFrom, hist: raw.hist } : null, weekly);
    return ext ? { ...raw, ...ext } : raw;
  };

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
            points: 1,
            since: card.updated_on,
            lastReal: card.updated_on,
          }
        : null,
    grades: Object.fromEntries(SEARCH_GRADES.map((g) => [g, null])),
    fetchedAt: new Date().toISOString(),
    source: 'catalog',
    ...(capped ? { capped } : {}),
  });

  // PokemonPriceTracker only covers Pokémon.
  if (card.game !== 'pokemon') {
    const f = fallback();
    return json({ ...f, raw: longRaw(f.raw) });
  }

  const { data: cached } = await admin.from('search_cache').select('payload, fetched_at').eq('product_id', productId).maybeSingle();
  if (cached && isFresh(cached.fetched_at) && hasAllGrades(cached.payload) && (cached.payload?.v ?? 1) >= ANSWER_VERSION)
    return json({ ...cached.payload, raw: longRaw(cached.payload.raw) });

  const ok = (await admin.rpc('claim_ppt_credits', { bucket_name: 'search', n: CREDITS_PER_OPEN, daily_cap: SEARCH_CAP })).data === true;
  if (!ok) return json(cached?.payload ? { ...cached.payload, capped: true } : fallback(true));

  try {
    const comps = await fetchComps(String(productId), card.language, HISTORY_DAYS);
    const today = new Date().toISOString().slice(0, 10);
    const history = comps?.priceHistory?.conditions?.['Near Mint']?.history ?? [];
    let raw = withPoints(
      summarize(rawDaily(history, today)),
      realDays(history.filter((h) => h.market != null && h.market > 0).map((h) => h.date), today),
    );
    // rawDaily carries the last price forward to today. When tonight's TCGplayer market in our
    // catalog is newer than PPT's last real point, the catalog is the truer "now".
    if (raw && card.market_cents != null && card.updated_on && (!raw.lastReal || raw.lastReal < card.updated_on)) {
      raw = { ...raw, marketCents: card.market_cents, series90: [...raw.series90.slice(0, -1), card.market_cents], asOf: card.updated_on };
    }
    if (raw) raw = longRaw({ ...raw, ...denseHistory(rawDaily(history, today, HISTORY_DAYS)) });
    const grades = Object.fromEntries(
      SEARCH_GRADES.map((g) => {
        const sales = (comps?.ebay?.priceHistory?.[g] ?? {}) as DailySales;
        const days = realDays(Object.keys(sales).filter((d) => sales[d]?.count > 0 && sales[d]?.average > 0), today);
        const s = withPoints(summarize(gradedDaily(sales, today)), days);
        const long = denseHistory(gradedDaily(sales, today, HISTORY_DAYS));
        // A grade with no sale in 90 days but some in 180 still gets its older history.
        const base = s ?? (long ? lastOnly(long) : null);
        // Every day with a sale in the history (180 days): the app's headline is the median of
        // the last 5 sales (src/pricing/lastSales.ts) and its 90-day low/high are real sales.
        const saleDays = Object.entries(sales)
          .filter(([, v]) => v?.count > 0 && v.average > 0)
          .map(([d, v]) => ({ day: d.slice(0, 10), cents: Math.round(v.average * 100), count: v.count }));
        return [g, base ? { ...base, ...long, lastSale: lastSale(sales), saleDays } : null];
      }),
    );
    const answer: Answer = { productId, raw: raw ?? fallback().raw, grades, fetchedAt: new Date().toISOString(), source: 'ppt', v: ANSWER_VERSION };
    await admin.from('search_cache').upsert({ product_id: productId, payload: answer, fetched_at: answer.fetchedAt });
    return json(answer);
  } catch {
    // PPT down or rate limited: yesterday's answer beats nothing.
    return json(cached?.payload ?? fallback());
  }
});

/** A summary for a grade whose only sales are 90 to 180 days old: its last 30-day median. */
function lastOnly(long: { histFrom: string; hist: number[] }): Summary {
  const end = new Date(`${long.histFrom}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + long.hist.length - 1);
  const last = long.hist[long.hist.length - 1];
  return { marketCents: last, lowCents: last, highCents: last, sales30d: 0, asOf: end.toISOString().slice(0, 10), series90: [last], points: 1 };
}
