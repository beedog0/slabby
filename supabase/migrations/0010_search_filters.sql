-- Search filters and price-change sorts.
--
-- 1. Filters run in the database (language, set, rarity), so "Japanese" searches every Japanese
--    card instead of filtering the top 60 matches on the phone.
-- 2. Each card keeps its last 31 nightly TCGplayer market prices in a small array (about 9 MB
--    for the whole catalog), so results can sort by the biggest 7- or 30-day rise or drop.
--    The history starts the first night this runs: 7-day change works after a week.

alter table catalog add column if not exists market_hist int[] not null default '{}';
alter table catalog add column if not exists change_7d real;   -- fraction, e.g. 0.12 = +12%
alter table catalog add column if not exists change_30d real;
create index if not exists catalog_lang_idx on catalog (game, language);
create index if not exists catalog_group_idx on catalog (group_id);

-- Change from `days` nights ago to the latest price. Null until there is that much history.
create or replace function hist_change(hist int[], days int) returns real
language sql immutable as $$
  select case
    when coalesce(array_length(hist, 1), 0) > days and hist[array_length(hist, 1) - days] > 0
      then (hist[array_length(hist, 1)]::real / hist[array_length(hist, 1) - days]) - 1
  end;
$$;

create or replace function last_n(a int[], n int) returns int[]
language sql immutable as $$ select a[greatest(1, coalesce(array_length(a, 1), 0) - n + 1):] $$;

-- catalog-import writes through this instead of a plain upsert: tonight's price is appended
-- to the history once per day (a rerun the same day replaces it), keeping the last 31.
create or replace function upsert_catalog(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into catalog as c (
    product_id, category_id, group_id, game, language, name, number, rarity, set_name, set_code,
    image_url, market_cents, low_cents, updated_on, market_hist
  )
  select r.product_id, r.category_id, r.group_id, r.game, r.language, r.name, r.number, r.rarity,
         r.set_name, r.set_code, r.image_url, r.market_cents, r.low_cents, r.updated_on,
         case when r.market_cents is null then '{}'::int[] else array[r.market_cents] end
  from jsonb_to_recordset(rows) as r(
    product_id bigint, category_id int, group_id int, game text, language text, name text,
    number text, rarity text, set_name text, set_code text, image_url text, market_cents int,
    low_cents int, updated_on date
  )
  on conflict (product_id) do update set
    category_id = excluded.category_id, group_id = excluded.group_id, game = excluded.game,
    language = excluded.language, name = excluded.name, number = excluded.number,
    rarity = excluded.rarity, set_name = excluded.set_name, set_code = excluded.set_code,
    image_url = excluded.image_url, market_cents = excluded.market_cents,
    low_cents = excluded.low_cents, updated_on = excluded.updated_on,
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

-- Search with filters and sorts. A set filter alone (no words) browses that set.
-- sort: best | price_high | price_low | name | rise_7d | drop_7d | rise_30d | drop_30d
drop function if exists search_catalog(text, text, int);
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
  where (game_filter is null or c.game = game_filter)
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
grant execute on function search_catalog(text, text, int, text, int, text[], text) to authenticated;

-- What the filter sheet offers for a search: languages, sets and rarities among the matches,
-- with counts. Ignores its own filters' current picks so you can switch between them.
create or replace function search_facets(q text, game_filter text default null, lang_filter text default null)
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
    where lang_filter is null or language = lang_filter group by group_id
  union all
  select 'rarity', rarity, rarity, count(*) from m
    where rarity is not null and (lang_filter is null or language = lang_filter) group by rarity
  order by 1, 4 desc;
$$;
grant execute on function search_facets(text, text, text) to authenticated;

-- How much of tonight's import is done, so the app can say the catalog is still loading.
create or replace function catalog_status() returns table (sets_total int, sets_done int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where imported_on is not null)::int from catalog_groups;
$$;
grant execute on function catalog_status() to authenticated;
