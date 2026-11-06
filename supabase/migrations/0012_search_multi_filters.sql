-- Multi-select search filters: several languages, sets and rarities at once. OR within a group,
-- AND across groups. New names (search_cards, search_cards_facets) so app builds still calling
-- search_catalog / search_facets from 0010 keep working until they update.

create or replace function search_cards(
  q text,
  game_filter text default null,
  lim int default 60,
  lang_filter text[] default null,
  group_filter int[] default null,
  rarity_filter text[] default null,
  sort text default 'best'
)
returns setof catalog
language sql stable set search_path = public as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(q, ''), '[#/,]', ' ', 'g'))), '\s+')) t
    where t <> ''
  )
  select c.* from catalog c
  where (game_filter is null or c.game = game_filter)
    and (lang_filter is null or c.language = any (lang_filter))
    and (group_filter is null or c.group_id = any (group_filter))
    and (rarity_filter is null or c.rarity = any (rarity_filter))
    and (exists (select 1 from terms) or group_filter is not null)
    and not exists (select 1 from terms where position(terms.t in c.search) = 0)
    and (not exists (select 1 from terms)
         or c.search like '%' || (select t from terms order by length(t) desc limit 1) || '%')
    and (sort not in ('rise_7d', 'drop_7d') or c.change_7d is not null)
    and (sort not in ('rise_30d', 'drop_30d') or c.change_30d is not null)
  order by
    case when sort = 'price_high' then c.market_cents end desc nulls last,
    case when sort = 'price_low' then c.market_cents end asc nulls last,
    case when sort = 'name' then c.name end asc,
    case when sort = 'rise_7d' then c.change_7d end desc,
    case when sort = 'drop_7d' then c.change_7d end asc,
    case when sort = 'rise_30d' then c.change_30d end desc,
    case when sort = 'drop_30d' then c.change_30d end asc,
    similarity(c.name, coalesce(q, '')) desc,
    c.market_cents desc nulls last
  limit least(lim, 100);
$$;
grant execute on function search_cards(text, text, int, text[], int[], text[], text) to authenticated;

-- Facets for a search: languages over all matches; sets and rarities within the picked languages.
create or replace function search_cards_facets(q text, game_filter text default null, lang_filter text[] default null)
returns table (kind text, key text, label text, n bigint)
language sql stable set search_path = public as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(q, ''), '[#/,]', ' ', 'g'))), '\s+')) t
    where t <> ''
  ),
  m as (
    select c.language, c.group_id, c.set_name, c.rarity from catalog c
    where (game_filter is null or c.game = game_filter)
      and exists (select 1 from terms)
      and not exists (select 1 from terms where position(terms.t in c.search) = 0)
      and c.search like '%' || (select t from terms order by length(t) desc limit 1) || '%'
  )
  select 'language', language, language, count(*) from m group by language
  union all
  select 'set', group_id::text, min(set_name), count(*) from m
    where lang_filter is null or language = any (lang_filter) group by group_id
  union all
  select 'rarity', rarity, rarity, count(*) from m
    where rarity is not null and (lang_filter is null or language = any (lang_filter)) group by rarity
  order by 1, 4 desc;
$$;
grant execute on function search_cards_facets(text, text, text[]) to authenticated;
