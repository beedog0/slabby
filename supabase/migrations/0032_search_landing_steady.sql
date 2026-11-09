-- Top movers and Sets rising, steadied (Bryan, Nov 9: a JP Magcargo showed −69% on the Search
-- tab while its own card page said "only 3 prices since Nov 6, not enough history"). One noisy
-- TCGplayer night could swing a card that barely trades.
--
-- Now a move needs:
--   * at least 10 priced nights in catalog.market_hist (a full week plus a baseline), the same
--     bar the card page uses before it shows a trend;
--   * "now" = median of the last 3 nights, "then" = median of nights 8–10 back, so one odd
--     night on either end can't make the move;
--   * both medians at least $20, and TCGplayer still listing it (low_cents present);
--   * the move between −60% and +200% (anything bigger on a $20+ card in a week is a data issue).
-- Every item carries its last 14 priced nights (`hist`) for a small price line, and sealed
-- product gets the same steady weekly change as cards.
-- Until the catalog has 10 nights, movers and sets come back empty and the app hides them; the
-- feed says when they start in `movers_from`.

create or replace function hist_median(hist int[], from_end int, n int) returns real
language sql immutable as $$
  -- Median of n entries ending `from_end` entries before the last (0 = the last n).
  select percentile_cont(0.5) within group (order by v)::real
  from unnest(hist[array_length(hist, 1) - from_end - n + 1 : array_length(hist, 1) - from_end]) v
  where v is not null and v > 0;
$$;

-- The catalog's own change_7d / change_30d (set pages, search sorts, card captions) use the same
-- steady rule, so every screen agrees: median of the last 3 nights against the median of the 3
-- nights ending `days` back; null until there are days + 3 priced nights.
create or replace function hist_change(hist int[], days int) returns real
language sql immutable as $$
  select case
    when coalesce(array_length(hist, 1), 0) >= days + 3
      then (hist_median(hist, 0, 3) / nullif(hist_median(hist, days, 3), 0)) - 1
  end;
$$;
update catalog set change_7d = hist_change(market_hist, 7), change_30d = hist_change(market_hist, 30)
where change_7d is distinct from hist_change(market_hist, 7) or change_30d is distinct from hist_change(market_hist, 30);

create or replace function search_landing(game_filter text default null)
returns jsonb
language sql stable set search_path = public as $$
  with priced as (
    select c.*, coalesce(array_length(c.market_hist, 1), 0) as nights
    from catalog c
    where c.market_cents is not null
      and (game_filter is null or c.game = game_filter)
  ),
  steady as (
    select p.*,
      hist_median(p.market_hist, 0, 3) as now_c,
      hist_median(p.market_hist, 7, 3) as then_c
    from priced p
    where p.sealed_type is null and p.nights >= 10 and p.low_cents is not null
  ),
  moved as (
    select s.*, (s.now_c / nullif(s.then_c, 0)) - 1 as chg from steady s
    where s.now_c >= 2000 and s.then_c >= 2000
  ),
  sane as (
    select * from moved where chg between -0.6 and 2 and abs(chg) >= 0.03
  ),
  card_json as (
    select product_id, chg, market_cents,
      jsonb_build_object(
        'product_id', product_id, 'game', game, 'language', language, 'name', name,
        'number', number, 'rarity', rarity, 'set_name', set_name, 'set_code', set_code,
        'image_url', image_url, 'market_cents', market_cents, 'low_cents', low_cents,
        'change_7d', change_7d, 'change_30d', change_30d, 'sealed_type', sealed_type,
        'change', chg, 'days', 7, 'then_cents', round(then_c)::int,
        'hist', market_hist[greatest(1, nights - 13):nights]
      ) as j
    from sane
  ),
  up as (select j, row_number() over (order by chg desc, market_cents desc) as ord from card_json where chg > 0 order by ord limit 12),
  down as (select j, row_number() over (order by chg asc, market_cents desc) as ord from card_json where chg < 0 order by ord limit 12),
  sealed as (
    select p.*,
      case when p.nights >= 10 then (hist_median(p.market_hist, 0, 3) / nullif(hist_median(p.market_hist, 7, 3), 0)) - 1 end as chg,
      case p.sealed_type when 'booster_box' then 0 when 'etb' then 1 when 'booster_bundle' then 2
        when 'collection' then 3 when 'booster_pack' then 4 else 5 end as kind_rank
    from priced p
    where p.sealed_type in ('booster_box', 'etb', 'booster_bundle', 'collection', 'booster_pack', 'tin', 'blister')
      and p.market_cents >= 500
  ),
  sealed_json as (
    select s.*, jsonb_build_object(
      'product_id', product_id, 'game', game, 'language', language, 'name', name,
      'number', number, 'rarity', rarity, 'set_name', set_name, 'set_code', set_code,
      'image_url', image_url, 'market_cents', market_cents, 'low_cents', low_cents,
      'change_7d', change_7d, 'change_30d', change_30d, 'sealed_type', sealed_type,
      'change', case when chg between -0.6 and 2 then chg end, 'days', 7,
      'hist', market_hist[greatest(1, nights - 13):nights]
    ) as j
    from sealed s
  ),
  sealed_new as (
    select j, row_number() over (order by group_id desc, kind_rank, market_cents desc) as ord
    from sealed_json where kind_rank <= 3 order by ord limit 12
  ),
  sealed_pick as (
    select j, row_number() over (order by md5(product_id::text || current_date::text)) as ord
    from sealed_json
    where kind_rank <= 2 and market_cents >= 4000
      and product_id not in (select (j->>'product_id')::bigint from sealed_new)
    order by ord limit 10
  ),
  -- Sets rising: median steady move of their $5+ singles, at least 6 of them with a week of history.
  set_moves as (
    select s.group_id, min(s.set_name) as set_name, min(s.game) as game, min(s.language) as language,
      percentile_cont(0.5) within group (order by (s.now_c / nullif(s.then_c, 0)) - 1) as chg,
      count(*) as n
    from steady s
    where s.now_c >= 500 and s.then_c >= 500
    group by s.group_id
    having count(*) >= 6
  ),
  hot as (select * from set_moves where chg >= 0.01 order by chg desc limit 8),
  newest as (
    select p.group_id, min(p.set_name) as set_name, min(p.game) as game, min(p.language) as language
    from priced p where p.sealed_type is null
    group by p.group_id having count(*) >= 20
    order by p.group_id desc limit 8
  ),
  sets as (
    select s.group_id, s.set_name, s.game, s.language, s.chg, 7 as nights, 'hot' as why,
      row_number() over (order by s.chg desc) as ord from hot s
    union all
    select n.group_id, n.set_name, n.game, n.language, null, null, 'new',
      row_number() over (order by n.group_id desc) from newest n
    where (select count(*) from hot) < 3
  ),
  set_json as (
    select s.ord, jsonb_build_object(
      'group_id', s.group_id, 'set_name', s.set_name, 'game', s.game, 'language', s.language,
      'change', s.chg, 'days', s.nights, 'why', s.why,
      'top_name', t.name, 'top_image', t.image_url, 'top_cents', t.market_cents
    ) as j
    from sets s
    left join lateral (
      select c.name, c.image_url, c.market_cents from catalog c
      where c.group_id = s.group_id and c.sealed_type is null and c.market_cents is not null
        and c.image_url is not null and c.image_url <> ''
      order by c.market_cents desc limit 1
    ) t on true
    where s.why = 'new' or (select count(*) from hot) >= 3
  )
  select jsonb_build_object(
    'up', coalesce((select jsonb_agg(j order by ord) from up), '[]'::jsonb),
    'down', coalesce((select jsonb_agg(j order by ord) from down), '[]'::jsonb),
    'sealed_new', coalesce((select jsonb_agg(j order by ord) from sealed_new), '[]'::jsonb),
    'sealed_pick', coalesce((select jsonb_agg(j order by ord) from sealed_pick), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(j order by ord) from set_json), '[]'::jsonb),
    'as_of', (select max(updated_on) from catalog),
    -- The day movers can start: when the longest history reaches 10 nights.
    'movers_from', (select current_date + greatest(0, 10 - max(nights)) from priced)
  );
$$;
grant execute on function search_landing(text) to authenticated;
