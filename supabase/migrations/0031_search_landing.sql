-- What the Search tab shows before you type: top movers, new sealed, a daily pick of sealed, and
-- sets on the move. One call, read-only, from the nightly TCGplayer catalog copy (no paid API).
--
-- Movers use up to 7 nights of catalog.market_hist. While history is shorter than a week they use
-- what there is (at least 2 nights) and say how many nights in `days`, so the section works from
-- the second night instead of staying empty for a week. Noise floors: market at least $20 now and
-- then, and moves over +300% / under -75% are dropped as bad rows (a mislabeled printing, a $0.01
-- night).
--
-- No release dates in the catalog: TCGplayer gives newer sets higher group ids, so "new" means the
-- highest group ids that have priced product.

create or replace function search_landing(game_filter text default null)
returns jsonb
language sql stable set search_path = public as $$
  with priced as (
    select c.*,
      least(coalesce(array_length(c.market_hist, 1), 0) - 1, 7) as nights
    from catalog c
    where c.market_cents is not null
      and (game_filter is null or c.game = game_filter)
  ),
  moved as (
    select p.*,
      p.market_hist[array_length(p.market_hist, 1) - p.nights] as then_cents,
      (p.market_cents::real / nullif(p.market_hist[array_length(p.market_hist, 1) - p.nights], 0)) - 1 as chg
    from priced p
    where p.sealed_type is null and p.nights >= 1 and p.market_cents >= 2000
  ),
  sane as (
    select * from moved
    where then_cents >= 2000 and chg between -0.75 and 3 and abs(chg) >= 0.02
  ),
  card_json as (
    select product_id, chg, nights, market_cents, then_cents,
      jsonb_build_object(
        'product_id', product_id, 'game', game, 'language', language, 'name', name,
        'number', number, 'rarity', rarity, 'set_name', set_name, 'set_code', set_code,
        'image_url', image_url, 'market_cents', market_cents, 'low_cents', low_cents,
        'change_7d', change_7d, 'change_30d', change_30d, 'sealed_type', sealed_type,
        'change', chg, 'days', nights, 'then_cents', then_cents
      ) as j
    from sane
  ),
  up as (select j, row_number() over (order by chg desc, market_cents desc) as ord from card_json where chg > 0 order by ord limit 12),
  down as (select j, row_number() over (order by chg asc, market_cents desc) as ord from card_json where chg < 0 order by ord limit 12),
  sealed as (
    select p.*,
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
      'change_7d', change_7d, 'change_30d', change_30d, 'sealed_type', sealed_type
    ) as j
    from sealed s
  ),
  -- Newest sets' boxes and ETBs first, one row per product.
  sealed_new as (
    select j, row_number() over (order by group_id desc, kind_rank, market_cents desc) as ord
    from sealed_json where kind_rank <= 3 order by ord limit 12
  ),
  -- A pick that changes once a day, not on every visit: boxes, ETBs and bundles worth $40+,
  -- not already in the newest list.
  sealed_pick as (
    select j, row_number() over (order by md5(product_id::text || current_date::text)) as ord
    from sealed_json
    where kind_rank <= 2 and market_cents >= 4000
      and product_id not in (select (j->>'product_id')::bigint from sealed_new)
    order by ord limit 10
  ),
  -- Sets on the move: median move of their $5+ singles, at least 6 of them moved.
  set_moves as (
    select p.group_id, min(p.set_name) as set_name, min(p.game) as game, min(p.language) as language,
      percentile_cont(0.5) within group (
        order by (p.market_cents::real / nullif(p.market_hist[array_length(p.market_hist, 1) - p.nights], 0)) - 1
      ) as chg,
      max(p.nights) as nights,
      count(*) as n
    from priced p
    where p.sealed_type is null and p.nights >= 1 and p.market_cents >= 500
      and p.market_hist[array_length(p.market_hist, 1) - p.nights] >= 500
    group by p.group_id
    having count(*) >= 6
  ),
  hot as (
    select * from set_moves where chg >= 0.01 order by chg desc limit 8
  ),
  newest as (
    select p.group_id, min(p.set_name) as set_name, min(p.game) as game, min(p.language) as language
    from priced p where p.sealed_type is null
    group by p.group_id having count(*) >= 20
    order by p.group_id desc limit 8
  ),
  sets as (
    select s.group_id, s.set_name, s.game, s.language, s.chg, s.nights, 'hot' as why,
      row_number() over (order by s.chg desc) as ord from hot s
    union all
    select n.group_id, n.set_name, n.game, n.language, null, null, 'new',
      row_number() over (order by n.group_id desc) from newest n
    where not exists (select 1 from hot)
  ),
  -- Each set's picture: its most valuable single that has one.
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
  )
  select jsonb_build_object(
    'up', coalesce((select jsonb_agg(j order by ord) from up), '[]'::jsonb),
    'down', coalesce((select jsonb_agg(j order by ord) from down), '[]'::jsonb),
    'sealed_new', coalesce((select jsonb_agg(j order by ord) from sealed_new), '[]'::jsonb),
    'sealed_pick', coalesce((select jsonb_agg(j order by ord) from sealed_pick), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(j order by ord) from set_json), '[]'::jsonb),
    'as_of', (select max(updated_on) from catalog)
  );
$$;
grant execute on function search_landing(text) to authenticated;
