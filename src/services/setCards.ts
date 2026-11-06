// "More from this set" on a searched card: the set's priciest singles from our own catalog, with
// TCGplayer's 7-day change (0010_search_filters). Reads Postgres only; no PokemonPriceTracker.

import catalogJson from '../mocks/catalog.json';
import type { CatalogCard } from './search';
import type { Found } from './searchFilters';
import { supabase } from './supabase';

type Mock = CatalogCard & { mock: unknown };

/** Up to `n` other cards from the same set, highest market first. */
export async function setCards(card: CatalogCard, n = 12): Promise<Found[]> {
  if (!supabase) {
    return (catalogJson as Mock[])
      .filter((c) => c.setName === card.setName && c.language === card.language && c.productId !== card.productId && c.marketCents != null)
      .sort((a, b) => (b.marketCents ?? 0) - (a.marketCents ?? 0))
      .slice(0, n)
      .map(({ mock: _m, ...c }) => ({ ...c, change7d: (((c.productId * 7) % 11) - 5) / 60, change30d: null }));
  }
  // group_id is indexed and names the set exactly; set_name alone isn't unique across languages.
  const { data: me } = await supabase.from('catalog').select('group_id').eq('product_id', card.productId).maybeSingle();
  if (!me) return [];
  const { data, error } = await supabase
    .from('catalog')
    .select('product_id, game, language, name, number, rarity, set_name, set_code, image_url, market_cents, low_cents, change_7d, change_30d')
    .eq('group_id', me.group_id)
    .neq('product_id', card.productId)
    .not('market_cents', 'is', null)
    .order('market_cents', { ascending: false })
    .limit(n);
  if (error || !data) return [];
  return data.map((r) => ({
    productId: r.product_id,
    game: r.game,
    language: r.language,
    name: r.name,
    number: r.number,
    rarity: r.rarity,
    setName: r.set_name,
    setCode: r.set_code,
    imageUrl: r.image_url,
    marketCents: r.market_cents,
    lowCents: r.low_cents,
    change7d: r.change_7d ?? null,
    change30d: r.change_30d ?? null,
  }));
}
