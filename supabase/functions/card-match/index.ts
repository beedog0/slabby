// card-match: resolve a card_key to a TCGplayer product id (and photo) once, shared by all users.
// Called by the app right after a card is added.
// Body: { cardKey, game, variety, name, number, language, setName, setCode, tcgPlayerId? }. game defaults to pokemon.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { nameAgrees, productName, rawToday } from '../_shared/comps-math.ts';
import { refreshProduct } from '../_shared/comps-write.ts';
import { matchCard, productTitle } from '../_shared/ppt.ts';
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
  // A Pokémon card with no set read ("psa:10::3:ja") is shared by every Japanese #3 PSA 10, so a
  // stored match for it is a guess about one of them: never final, match again (and overwrite).
  const noSet = (c.game ?? 'pokemon') === 'pokemon' && !c.setCode && !c.setName && !c.tcgPlayerId;
  if (known.data?.tcgplayer_id && !noSet) {
    if (known.data.matched_name || (known.data.game ?? 'pokemon') !== 'pokemon') return json(known.data);
    // Matched before names were kept: look the name up once so the app can fix label misreads.
    const id = known.data.tcgplayer_id;
    const title =
      (await productTitle(id, known.data.language).catch(() => null)) ??
      (await tcgcsvMatch(c).catch(() => null).then((t) => (t?.tcgPlayerId === id ? t.name : null)));
    const name = productName(title);
    if (name) await admin.from('card_refs').update({ matched_name: name }).eq('card_key', c.cardKey);
    return json({ ...known.data, matched_name: name });
  }

  const game: string = c.game ?? 'pokemon';
  // Korean and Chinese Pokémon cards have no TCGplayer or PokemonPriceTracker listing. Matching
  // them by number in the English or Japanese catalog finds a different card (a Korean SV-P
  // Ditto came back as an English Eevee promo), so leave them unmatched: no photo, no price.
  if (game === 'pokemon' && c.language && c.language !== 'en' && c.language !== 'ja') {
    const row = { card_key: c.cardKey, game, language: c.language, tcgplayer_id: null, image_url: null, matched_set: null };
    await admin.from('card_refs').upsert(row);
    return json(row);
  }
  if (game === 'pokemon') {
    // PokemonPriceTracker first (it also has the prices); the TCGplayer catalog for what it misses.
    // Added from search: the product is already known, so no search credit is spent.
    // Search hands us the product, so it is trusted. A scanned card's number-matched product must
    // also fit the label's name, or it's another card that shares the number.
    const fits = <T extends { name: string } | null>(m: T) => (m && nameAgrees(c.name, m.name) ? m : null);
    const m =
      (await fromCatalog(admin, c.tcgPlayerId).catch(() => null)) ??
      fits(await matchCard(c).catch(() => null)) ??
      fits(await tcgcsvMatch(c).catch(() => null));
    const row = {
      card_key: c.cardKey,
      game,
      language: c.language ?? 'en',
      tcgplayer_id: m?.tcgPlayerId ?? null,
      image_url: m?.image ?? null,
      matched_set: m?.setName ?? null,
      // The catalog's name for the card. The app prefers it over a label read that missed the name.
      matched_name: productName(m?.name),
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
  await refreshProduct(admin, tcgPlayerId, language, [cardKey]);
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

/** A product picked in card search, looked up in our own catalog (0008_card_search.sql). */
async function fromCatalog(admin: ReturnType<typeof createClient>, id: unknown) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const { data } = await admin.from('catalog').select('product_id, name, image_url, set_name').eq('product_id', Number(id)).maybeSingle();
  return data
    ? { tcgPlayerId: String(data.product_id), image: data.image_url as string, setName: data.set_name as string, name: data.name as string }
    : null;
}
