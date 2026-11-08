-- Backup pictures for catalog cards TCGplayer has no picture for (about 3,800 singles on
-- 2026-11-08: World Championship Deck cards, L1–L3 Japanese, mirror variants, trainer kits…).
--
-- image_url stays TCGplayer's and is never touched here. image_alt_url is a second picture the
-- app shows when it is set, found by catalog-import after the night's sets are done
-- (_shared/alt-images.ts), in this order:
--   1. same_set  - another printing in the same set with the same number and name that has a
--                  picture (Master Ball / Poké Ball mirrors, Mirror Holofoil)
--   2. tcgdex    - TCGdex (free, no key), matched by set code + card number
--   3. other_set - the same card name and full number in another set of the same game and
--                  language (World Championship Deck cards → the regular print)
-- Never across languages: a Japanese card never borrows an English picture.
--
-- "No picture" comes from art-hash (0016/0019): catalog_art rows parked with tries >= 3 and no
-- hash. When TCGplayer adds the picture later, art-hash hashes it and clear_found_alt_images
-- drops the backup.

alter table catalog add column if not exists image_alt_url text;
alter table catalog add column if not exists image_alt_source text;   -- same_set | tcgdex | other_set
alter table catalog add column if not exists image_alt_checked_at timestamptz;

create index if not exists catalog_number_idx on catalog (game, language, lower(number));

-- "Lugia V - 2023 (Gabriel Fernandez)" → "lugia v"; "Lugia Legend - 029/070 (Mirror Holofoil)"
-- → "lugia legend".
create or replace function card_base_name(n text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(regexp_replace(coalesce(n, ''), '\s+-\s+.*$', ''), '\s*\([^)]*\)', '', 'g')));
$$;

-- Cards to look for: no TCGplayer picture, no backup yet, not looked at in the last 3 days.
-- Claimed by stamping image_alt_checked_at, so overlapping runs don't share them.
create or replace function claim_alt_image_batch(n int)
returns table (product_id bigint, game text, language text, name text, number text, set_code text, group_id int)
language sql security definer set search_path = public as $$
  with picked as (
    select c.product_id
    from catalog c
    join catalog_art a on a.product_id = c.product_id
    where c.sealed_type is null and c.number is not null
      and a.hashed_at is null and a.tries >= 3
      and c.image_alt_url is null
      and coalesce(c.image_alt_checked_at, '-infinity') < now() - interval '3 days'
    order by (c.game = 'pokemon') desc, c.market_cents desc nulls last, c.product_id
    limit n
  )
  update catalog c set image_alt_checked_at = now()
  from picked p where c.product_id = p.product_id
  returning c.product_id, c.game, c.language, c.name, c.number, c.set_code, c.group_id;
$$;

-- The best sibling picture for each card: same set first, then another set. A sibling counts only
-- when art-hash fetched its TCGplayer picture (hashed_at set), so we never point at another 403.
-- other_set needs a full number ("138/195", "OP01-001") so promo-style numbers can't collide.
create or replace function sibling_alt_images(ids bigint[])
returns table (product_id bigint, image_url text, source text)
language sql stable security definer set search_path = public as $$
  select x.product_id, s.image_url, s.source
  from catalog x
  cross join lateral (
    select c.image_url, case when c.group_id = x.group_id then 'same_set' else 'other_set' end as source
    from catalog c
    join catalog_art a on a.product_id = c.product_id
    where c.game = x.game and c.language = x.language
      and lower(c.number) = lower(x.number)
      and c.product_id <> x.product_id
      and c.sealed_type is null
      and a.hashed_at is not null and a.image_url = c.image_url
      and card_base_name(c.name) = card_base_name(x.name)
      and (c.group_id = x.group_id or x.number ~ '/' or x.number ~ '^[A-Za-z]+[0-9]*-[0-9]+$')
    order by (c.group_id = x.group_id) desc, c.market_cents desc nulls last, c.product_id
    limit 1
  ) s
  where x.product_id = any(ids);
$$;

-- Write what was found: [{product_id, url, source}].
create or replace function save_alt_images(rows jsonb) returns int
language sql security definer set search_path = public as $$
  with u as (
    update catalog c set image_alt_url = r.url, image_alt_source = r.source
    from jsonb_to_recordset(rows) as r(product_id bigint, url text, source text)
    where c.product_id = r.product_id and r.url is not null
    returning 1
  )
  select count(*)::int from u;
$$;

-- TCGplayer added the picture since: art-hash hashed the TCGplayer image itself, so the backup goes.
create or replace function clear_found_alt_images() returns int
language sql security definer set search_path = public as $$
  with u as (
    update catalog c set image_alt_url = null, image_alt_source = null
    from catalog_art a
    where a.product_id = c.product_id and c.image_alt_url is not null
      and a.hashed_at is not null and a.image_url = c.image_url
    returning 1
  )
  select count(*)::int from u;
$$;

revoke execute on function claim_alt_image_batch(int) from public, anon, authenticated;
revoke execute on function sibling_alt_images(bigint[]) from public, anon, authenticated;
revoke execute on function save_alt_images(jsonb) from public, anon, authenticated;
revoke execute on function clear_found_alt_images() from public, anon, authenticated;
