// card-match: resolve a card_key to a TCGplayer product id (and photo) once, shared by all users.
// Called by the app right after a card is added. Body: { cardKey, name, number, language, setName, setCode }.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { gradeKey, gradedDaily, rawDaily, type DailySales } from '../_shared/comps-math.ts';
import { fetchComps, matchCard } from '../_shared/ppt.ts';
import { tcgcsvMatch } from '../_shared/tcgcsv.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || !(await admin.auth.getUser(jwt)).data.user) return json({ error: 'Sign in first' }, 401);

  const c = await req.json().catch(() => null);
  if (!c?.cardKey || !c?.name) return json({ error: 'Bad request' }, 400);

  const known = await admin.from('card_refs').select('*').eq('card_key', c.cardKey).maybeSingle();
  // A matched card is final. An unmatched one is tried again: matching improves, and the card's
  // details may have been fixed since.
  if (known.data?.tcgplayer_id) return json(known.data);

  // PokemonPriceTracker first (it also has the prices); the TCGplayer catalog for what it misses.
  const m = (await matchCard(c).catch(() => null)) ?? (await tcgcsvMatch(c).catch(() => null));
  const row = {
    card_key: c.cardKey,
    language: c.language ?? 'en',
    tcgplayer_id: m?.tcgPlayerId ?? null,
    image_url: m?.image ?? null,
    matched_set: m?.setName ?? null,
  };
  await admin.from('card_refs').upsert(row);
  if (m?.tcgPlayerId) await firstComps(admin, c.cardKey, m.tcgPlayerId, row.language).catch(() => {});
  return json(row);
});

/** Prices for a brand-new card now, instead of waiting for tonight's comps-nightly run. 3 credits. */
async function firstComps(admin: ReturnType<typeof createClient>, cardKey: string, tcgPlayerId: string, language: string) {
  const card = await fetchComps(tcgPlayerId, language);
  const [grader, grade] = cardKey.split(':');
  const gk = gradeKey(grader, grade ? Number(grade) : null);
  const today = new Date().toISOString().slice(0, 10);
  const rows = gk
    ? gradedDaily((card.ebay?.priceHistory?.[gk] ?? {}) as DailySales, today)
    : rawDaily(card.priceHistory?.conditions?.['Near Mint']?.history ?? [], today);
  if (rows.length) await admin.from('price_daily').upsert(rows.map((r) => ({ card_key: cardKey, ...r })));
}
