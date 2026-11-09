-- Art type for the search Filter: one short list across Pokémon, One Piece and Riftbound
-- (standard, holo, full_art, alt_art, illustration, special_illustration, secret, promo), derived
-- from TCGplayer's rarity, its name tags ("(Alternate Art)", "(Full Art)", "(Parallel)") and the
-- card number. Same rule as src/lib/artType.ts; change both together. Postgres regex uses \y for
-- a word boundary where JavaScript uses \b.

create or replace function art_type(game text, language text, rarity text, name text, number text)
returns text
language sql immutable parallel safe as $$
  select case
    when n ~ '\((signature|metal)\y' then 'secret'
    when n ~ '\((alternate|alt\.?)\y[^)]*art' or n ~ '\((parallel|manga|overnumbered)\y' then 'alt_art'
    when game = 'onepiece' and n ~ '\(sp\)' then 'alt_art'
    when game = 'riftbound' and r in ('showcase', 'overnumbered') then 'alt_art'
    when r in ('special illustration rare', 'special art rare', 'character super rare') then 'special_illustration'
    when r in ('illustration rare', 'art rare', 'character rare', 'character holo rare') or r like 'trainer gallery%' then 'illustration'
    when game = 'pokemon' and no ~ '^(tg|gg)[0-9]' then 'illustration'
    when r ~ '(secret|hyper|rainbow|gold|treasure)' or r in ('sec', 'tr') or n ~ '\(secret\)' then 'secret'
    when game = 'pokemon' and language = 'ja' and r in ('ultra rare', 'mega ultra rare') then 'secret'
    when r in ('promo', 'pr') then 'promo'
    when n ~ '\(full art\)' then 'full_art'
    when game = 'pokemon' and language = 'ja' and r in ('super rare', 'trainer rare') then 'full_art'
    when game = 'pokemon' and r = 'shiny ultra rare' then 'full_art'
    when game = 'pokemon' and r = 'ultra rare' then
      -- Nested so the casts only run on numbers shaped like 183/165 (AND doesn't short-circuit).
      case when no ~ '^[0-9]{1,6} */ *[0-9]{1,6}$' then
        case when split_part(replace(no, ' ', ''), '/', 1)::int > split_part(replace(no, ' ', ''), '/', 2)::int
             then 'full_art' else 'holo' end
      else 'holo' end
    when game = 'pokemon' and r ~ '(holo|double rare|triple rare|ultra rare|radiant|kagayaku|shining|amazing|ace spec|ace rare|prism|break|shiny|rare ace|legend|lv\.x|pikachu rare|futuristic|mega attack|black white|rgb rare|classic collection)' then 'holo'
    else 'standard'
  end
  from (select lower(trim(coalesce(rarity, ''))) as r, lower(coalesce(name, '')) as n, lower(trim(coalesce(number, ''))) as no) x;
$$;

-- Stored, so filters and facets read a column instead of re-running the rule per row. Sealed
-- product has no art type.
alter table catalog add column if not exists art_type text
  generated always as (case when sealed_type is null then art_type(game, language, rarity, name, number) end) stored;
create index if not exists catalog_art_type_idx on catalog (art_type);

-- search_cards gains art_filter (pick-several, OR within the group, AND with the others).
drop function if exists search_cards(text, text, int, text[], int[], text[], text, text[]);
create or replace function search_cards(
  q text,
  game_filter text default null,
  lim int default 60,
  lang_filter text[] default null,
  group_filter int[] default null,
  rarity_filter text[] default null,
  sort text default 'best',
  type_filter text[] default null,
  art_filter text[] default null
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
    and (type_filter is null
         or ('card' = any (type_filter) and c.sealed_type is null)
         or ('sealed' = any (type_filter) and c.sealed_type is not null)
         or c.sealed_type = any (type_filter))
    and (art_filter is null or c.art_type = any (art_filter))
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
grant execute on function search_cards(text, text, int, text[], int[], text[], text, text[], text[]) to authenticated;

-- Facets gain kind 'art': each art type among the matching singles.
create or replace function search_cards_facets(q text, game_filter text default null, lang_filter text[] default null)
returns table (kind text, key text, label text, n bigint)
language sql stable set search_path = public as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(q, ''), '[#/,]', ' ', 'g'))), '\s+')) t
    where t <> ''
  ),
  m as (
    select c.language, c.group_id, c.set_name, c.rarity, c.sealed_type, c.art_type from catalog c
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
  union all
  select 'type', coalesce(sealed_type, 'card'), coalesce(sealed_type, 'card'), count(*) from m
    where lang_filter is null or language = any (lang_filter) group by sealed_type
  union all
  select 'art', art_type, art_type, count(*) from m
    where art_type is not null and (lang_filter is null or language = any (lang_filter)) group by art_type
  order by 1, 4 desc;
$$;
grant execute on function search_cards_facets(text, text, text[]) to authenticated;
