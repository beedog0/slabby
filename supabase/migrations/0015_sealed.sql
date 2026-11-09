-- Sealed product: booster boxes, ETBs, booster bundles, packs, blisters, tins, collection boxes,
-- decks and cases from TCGplayer's catalog (TCGCSV, free), with photos and nightly market prices,
-- in the same `catalog` table as singles. catalog-import fills them from tonight's run.
-- Price and trend come from the catalog's own nightly TCGplayer market (market_hist, 31 nights):
-- no PokemonPriceTracker credits.

alter table catalog add column if not exists sealed_type text;  -- null = a single card
create index if not exists catalog_sealed_idx on catalog (sealed_type) where sealed_type is not null;

-- A sealed item in the vault: which kind. Its card_key is "sealed:<TCGplayer product id>".
alter table slabs add column if not exists sealed_type text;

create or replace function upsert_catalog(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into catalog as c (
    product_id, category_id, group_id, game, language, name, number, rarity, set_name, set_code,
    image_url, market_cents, low_cents, updated_on, market_hist, printings, sealed_type
  )
  select r.product_id, r.category_id, r.group_id, r.game, r.language, r.name, r.number, r.rarity,
         r.set_name, r.set_code, r.image_url, r.market_cents, r.low_cents, r.updated_on,
         case when r.market_cents is null then '{}'::int[] else array[r.market_cents] end,
         coalesce(r.printings, '[]'::jsonb), r.sealed_type
  from jsonb_to_recordset(rows) as r(
    product_id bigint, category_id int, group_id int, game text, language text, name text,
    number text, rarity text, set_name text, set_code text, image_url text, market_cents int,
    low_cents int, updated_on date, printings jsonb, sealed_type text
  )
  on conflict (product_id) do update set
    category_id = excluded.category_id, group_id = excluded.group_id, game = excluded.game,
    language = excluded.language, name = excluded.name, number = excluded.number,
    rarity = excluded.rarity, set_name = excluded.set_name, set_code = excluded.set_code,
    image_url = excluded.image_url, market_cents = excluded.market_cents,
    low_cents = excluded.low_cents, updated_on = excluded.updated_on, printings = excluded.printings,
    sealed_type = excluded.sealed_type,
    market_hist = case
      when excluded.market_cents is null then c.market_hist
      else last_n(
        (case when c.updated_on = excluded.updated_on and array_length(c.market_hist, 1) > 0
              then c.market_hist[1:array_length(c.market_hist, 1) - 1]
              else c.market_hist end)
        || excluded.market_cents,
        31)
    end;
  get diagnostics n = row_count;
  update catalog set change_7d = hist_change(market_hist, 7), change_30d = hist_change(market_hist, 30)
  where product_id in (select (x->>'product_id')::bigint from jsonb_array_elements(rows) x);
  return n;
end $$;
revoke execute on function upsert_catalog(jsonb) from public, anon, authenticated;
grant execute on function upsert_catalog(jsonb) to service_role;

-- The scan's name search (search_catalog, 0010) only ever wants singles.
create or replace function search_catalog(
  q text,
  game_filter text default null,
  lim int default 60,
  lang_filter text default null,
  group_filter int default null,
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
  where c.sealed_type is null
    and (game_filter is null or c.game = game_filter)
    and (lang_filter is null or c.language = lang_filter)
    and (group_filter is null or c.group_id = group_filter)
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

-- Card search gains a Type filter. type_filter values: 'card' (singles), 'sealed' (any sealed
-- product), or one sealed_type ('booster_box', 'etb', …). OR within the group, like the others.
-- Replaced, not overloaded: PostgREST can't pick between two versions that differ by a default.
drop function if exists search_cards(text, text, int, text[], int[], text[], text);
create or replace function search_cards(
  q text,
  game_filter text default null,
  lim int default 60,
  lang_filter text[] default null,
  group_filter int[] default null,
  rarity_filter text[] default null,
  sort text default 'best',
  type_filter text[] default null
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
grant execute on function search_cards(text, text, int, text[], int[], text[], text, text[]) to authenticated;

-- Facets gain kind 'type': 'card' for singles and each sealed_type among the matches.
create or replace function search_cards_facets(q text, game_filter text default null, lang_filter text[] default null)
returns table (kind text, key text, label text, n bigint)
language sql stable set search_path = public as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(q, ''), '[#/,]', ' ', 'g'))), '\s+')) t
    where t <> ''
  ),
  m as (
    select c.language, c.group_id, c.set_name, c.rarity, c.sealed_type from catalog c
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
  order by 1, 4 desc;
$$;
grant execute on function search_cards_facets(text, text, text[]) to authenticated;
