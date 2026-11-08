-- Card art fingerprints: identify a card from a photo of its art, not its text.
--
-- art-hash (Edge Function) downloads each catalog card's TCGplayer image and stores two 64-bit
-- perceptual hashes and a colour grid (supabase/functions/_shared/art-hash.ts). The scan screen
-- straightens the card in a photo, takes the same fingerprint, and match_card_art returns the
-- nearest catalog cards by Hamming distance. No paid API: images come from TCGplayer's CDN, the
-- same ones the app already shows.

create table if not exists catalog_art (
  product_id bigint primary key references catalog (product_id) on delete cascade,
  face bit(64),                       -- pHash of the whole face (inside the border)
  art bit(64),                        -- pHash of the art window
  color smallint[],                   -- 4×5 grid × RGB, relative to the face's mean
  image_url text,                     -- the image hashed, so a changed image is hashed again
  hashed_at timestamptz,
  claimed_at timestamptz,
  tries int not null default 0
);
alter table catalog_art enable row level security;          -- read through match_card_art only

-- The next cards to fingerprint, claimed so overlapping runs don't share them: never hashed, or
-- the image changed (cards only: sealed products have no number and no art to match); a failed image is retried after 10 minutes, at most 3 times. Pokémon first,
-- then the pricier cards (the ones likely to be scanned).
create or replace function claim_art_batch(n int) returns table (product_id bigint, image_url text)
language sql security definer set search_path = public as $$
  with picked as (
    select c.product_id, c.image_url
    from catalog c
    left join catalog_art a on a.product_id = c.product_id
    where c.number is not null and (a.product_id is null
       or (a.hashed_at is null and a.tries < 3 and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is not null and a.image_url is distinct from c.image_url))
    order by (c.game = 'pokemon') desc, c.market_cents desc nulls last, c.product_id
    limit n
  ), claimed as (
    insert into catalog_art (product_id, claimed_at, tries)
    select p.product_id, now(), 1 from picked p
    on conflict (product_id) do update set claimed_at = now(), tries = catalog_art.tries + 1
    returning catalog_art.product_id
  )
  select p.product_id, p.image_url from picked p join claimed using (product_id);
$$;
revoke execute on function claim_art_batch(int) from public, anon, authenticated;

-- Claimed but not reached in a run (its CPU budget ran out): back in the queue, not a try.
create or replace function release_art_claims(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update catalog_art set claimed_at = null, tries = greatest(tries - 1, 0)
  where product_id = any(ids) and hashed_at is null;
$$;
revoke execute on function release_art_claims(bigint[]) from public, anon, authenticated;

-- How far along the fingerprints are (for the deploy check and the backtest).
create or replace function art_status() returns table (cards int, hashed int, failed int)
language sql security definer set search_path = public as $$
  select (select count(*)::int from catalog where number is not null),
         (select count(*)::int from catalog_art where hashed_at is not null),
         (select count(*)::int from catalog_art where hashed_at is null and tries >= 3);
$$;
grant execute on function art_status() to anon, authenticated;

-- Nearest catalog cards to a photo's fingerprint. face/art are bit(64) literals ('0101…'); the
-- second pair is the same photo turned 180° (a card held upside down), so either way finds it.
-- A full scan of ~65k rows of two bit_counts runs in tens of milliseconds; no index needed.
create or replace function match_card_art(face text, art text, face2 text default null, art2 text default null, lim int default 24)
returns table (
  product_id bigint, game text, language text, name text, number text, rarity text, set_name text, set_code text,
  image_url text, market_cents int, low_cents int, printings jsonb,
  color smallint[], d_face int, d_art int, d_face2 int, d_art2 int
)
language sql stable security definer set search_path = public as $$
  with q as (
    select face::bit(64) f1, art::bit(64) a1,
           coalesce(face2, face)::bit(64) f2, coalesce(art2, art)::bit(64) a2
  ), near as (
    select a.product_id, a.color,
           bit_count(a.face # q.f1)::int d_face, bit_count(a.art # q.a1)::int d_art,
           bit_count(a.face # q.f2)::int d_face2, bit_count(a.art # q.a2)::int d_art2
    from catalog_art a, q
    where a.hashed_at is not null
    order by least(bit_count(a.face # q.f1) + bit_count(a.art # q.a1), bit_count(a.face # q.f2) + bit_count(a.art # q.a2))
    limit least(greatest(lim, 1), 60)
  )
  select c.product_id, c.game, c.language, c.name, c.number, c.rarity, c.set_name, c.set_code,
         c.image_url, c.market_cents, c.low_cents, c.printings,
         n.color, n.d_face, n.d_art, n.d_face2, n.d_art2
  from near n join catalog c on c.product_id = n.product_id;
$$;
-- anon too: the backtest (scripts/backtest) runs without a signed-in user. It only returns
-- public TCGplayer catalog rows, at most 60 per call.
grant execute on function match_card_art(text, text, text, text, int) to anon, authenticated;

-- Fires art-hash once (one batch), only while cards are waiting, so the schedule costs nothing
-- once the catalog is done. Same cron token as comps-nightly (0005_cron.sql).
create or replace function public.run_art_hash() returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.catalog c left join public.catalog_art a on a.product_id = c.product_id
    where c.number is not null and (a.product_id is null
       or (a.hashed_at is null and a.tries < 3 and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is not null and a.image_url is distinct from c.image_url))
  ) then
    return null;
  end if;
  return net.http_post(
    url := 'https://yiojhrauddycaktjhfma.supabase.co/functions/v1/art-hash',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpb2pocmF1ZGR5Y2FrdGpoZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDQ1OTAsImV4cCI6MjA5Nzg4MDU5MH0.XxlmeKkVkRo6TuHYeDOsl7XNwo16t2XQLOfNJJQMKtI',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'comps_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
end;
$$;
revoke execute on function public.run_art_hash() from public, anon, authenticated;

-- Every 20 seconds: the first fill (~65k cards, a few hundred per minute) takes a few hours;
-- after that only new cards from the nightly catalog-import are waiting.
select cron.schedule('art-hash', '20 seconds', 'select public.run_art_hash()');
