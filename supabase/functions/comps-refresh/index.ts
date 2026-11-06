// comps-refresh: refresh one card's comps now, when the app sees they're stale (card screen) or
// the user pulls to refresh. Body: { cardKey, force? }. The caller must own a slab with that key.
// Cooldown 6 h per card_key (1 h with force), budgets per user and overall per day, enforced in
// claim_comps_refresh (0007_comps_freshness.sql). Every other card_key on the same product is
// written from the same call.
// Always answers 200: { status: 'refreshed' | 'fresh' | 'throttled' | 'no_match' | 'not_owned' | 'error', refreshedAt, lastSaleDay }.
// 'not_owned': no slab with that key for this user yet (e.g. not synced); the app treats it as skipped.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { refreshProduct } from '../_shared/comps-write.ts';

const COOLDOWN = '6 hours';
const FORCE_COOLDOWN = '1 hour';
const USER_LIMIT = 30;
const ANON_LIMIT = 30; // same as signed-in; the global budget caps the total
const GLOBAL_LIMIT = 1500;

type Status = 'refreshed' | 'fresh' | 'throttled' | 'no_match' | 'not_owned' | 'error';
const json = (status: Status, refreshedAt: string | null = null, lastSaleDay: string | null = null, message?: string) =>
  new Response(JSON.stringify({ status, refreshedAt, lastSaleDay, ...(message ? { message } : {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const user = jwt ? (await admin.auth.getUser(jwt)).data.user : null;
  if (!user) return json('error', null, null, 'Sign in first');

  const body = await req.json().catch(() => null);
  const cardKey = typeof body?.cardKey === 'string' ? body.cardKey : null;
  if (!cardKey) return json('error', null, null, 'Bad request');
  const force = body?.force === true;

  const owned = await admin.from('slabs').select('id').eq('user_id', user.id).eq('card_key', cardKey).limit(1);
  if (owned.error) return json('error', null, null, owned.error.message);
  if (!owned.data?.length) return json('not_owned');

  const current = async () => {
    const { data } = await admin
      .from('card_refs')
      .select('comps_refreshed_at, last_sale_day')
      .eq('card_key', cardKey)
      .maybeSingle();
    return { refreshedAt: data?.comps_refreshed_at ?? null, lastSaleDay: data?.last_sale_day ?? null };
  };

  const { data: ref } = await admin.from('card_refs').select('*').eq('card_key', cardKey).maybeSingle();
  // PokemonPriceTracker only carries Pokémon; other games refresh nightly from TCGCSV. No claim spent.
  if (!ref?.tcgplayer_id || (ref.game ?? 'pokemon') !== 'pokemon') return json('no_match');

  // The lock's previous value, put back if PPT fails for a reason other than its rate limit, so
  // the next pull retries instead of waiting out the cooldown.
  const { data: before } = await admin.from('card_refs').select('comps_attempted_at').eq('card_key', cardKey).maybeSingle();
  const prevAttempt: string | null = before?.comps_attempted_at ?? null;

  const { data: claim, error: claimErr } = await admin.rpc('claim_comps_refresh', {
    p_user: user.id,
    p_key: cardKey,
    p_cooldown: force ? FORCE_COOLDOWN : COOLDOWN,
    p_user_limit: user.is_anonymous ? ANON_LIMIT : USER_LIMIT,
    p_global_limit: GLOBAL_LIMIT,
  });
  if (claimErr) return json('error', null, null, claimErr.message);
  if (claim === 'no_match') return json('no_match');
  if (claim === 'fresh') {
    const c = await current();
    return json('fresh', c.refreshedAt, c.lastSaleDay);
  }
  if (claim !== 'ok') {
    const c = await current();
    return json('throttled', c.refreshedAt, c.lastSaleDay);
  }

  if (!ref?.tcgplayer_id) return json('no_match');
  // Other grades of the same card ride along on the same call.
  const { data: siblings } = await admin.from('card_refs').select('card_key').eq('tcgplayer_id', ref.tcgplayer_id);
  const keys = [...new Set([cardKey, ...(siblings ?? []).map((s: { card_key: string }) => s.card_key)])];

  try {
    const r = await refreshProduct(admin, ref.tcgplayer_id, ref.language ?? 'en', keys);
    return json('refreshed', r.refreshedAt, r.lastSale[cardKey]?.day ?? null);
  } catch (e) {
    const message = (e as Error).message;
    const c = await current();
    if (message === 'ppt_rate_limited') return json('throttled', c.refreshedAt, c.lastSaleDay);
    await admin.from('card_refs').update({ comps_attempted_at: prevAttempt }).eq('card_key', cardKey);
    console.error(`comps-refresh ${cardKey}: ${message}`);
    return json('error', c.refreshedAt, c.lastSaleDay, message);
  }
});
