// card-match: resolve a card_key to a TCGplayer product id (and photo) once, shared by all users.
// Called by the app right after a card is added.
// Body: { cardKey, game, variety, name, number, language, setName, setCode }. game defaults to pokemon.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { gradeKey, gradedDaily, rawDaily, rawToday, type DailySales } from '../_shared/comps-math.ts';
import { fetchComps, matchCard } from '../_shared/ppt.ts';
import { tcgcsvMarket, tcgcsvMatch, type TcgMatch } from '../_shared/tcgcsv.ts';

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

  const game: string = c.game ?? 'pokemon';
  if (game === 'pokemon') {
    // PokemonPriceTracker first (it also has the prices); the TCGplayer catalog for what it misses.
    const m = (await matchCard(c).catch(() => null)) ?? (await tcgcsvMatch(c).catch(() => null));
    const row = {
      card_key: c.cardKey,
      game,
      language: c.language ?? 'en',
      tcgplayer_id: m?.tcgPlayerId ?? null,
      image_url: m?.image ?? null,
      matched_set: m?.setName ?? null,
    };
    await admin.from('card_refs').upsert(row);
    if (m?.tcgPlayerId) await firstComps(admin, c.cardKey, m.tcgPlayerId, row.language).catch(() => {});
    return json(row);
  }

  // One Piece and Riftbound: PokemonPriceTracker doesn't carry them, so TCGplayer via TCGCSV only.
  const m: TcgMatch | null = await tcgcsvMatch({ ...c, game }).catch(() => null);
  const priced = !!m?.priced;
  const row = {
    card_key: c.cardKey,
    game,
    language: c.language ?? 'en',
    // Only a priced match is final; an art-only one stays open so a real match can replace it.
    tcgplayer_id: priced ? m!.tcgPlayerId : null,
    image_url: m?.image ?? null,
    matched_set: m?.setName ?? null,
    tcgcsv_category: m?.category ?? null,
    tcgcsv_group: m?.group ?? null,
    priced,
  };
  await admin.from('card_refs').upsert(row);
  if (priced) await firstTcgComps(admin, c.cardKey, row.tcgcsv_category!, row.tcgcsv_group!, m!.tcgPlayerId).catch(() => {});
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

/**
 * Today's price for a new One Piece or Riftbound card. TCGplayer market is a raw price, so only
 * raw cards get one; graded copies wait for a graded sold source (see TECH.md).
 */
async function firstTcgComps(admin: ReturnType<typeof createClient>, cardKey: string, category: number, group: number, productId: string) {
  if (!cardKey.startsWith('raw:')) return;
  const market = await tcgcsvMarket(category, group, productId);
  if (market == null) return;
  const today = new Date().toISOString().slice(0, 10);
  const row = rawToday([], market, today);
  if (row) await admin.from('price_daily').upsert({ card_key: cardKey, ...row });
}
