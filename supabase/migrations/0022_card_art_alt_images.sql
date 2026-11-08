-- Fingerprint the backup pictures (image_alt_url, 0021 from the "fill in missing card photos" work)
-- for the ~3,800 singles TCGplayer has no picture for. Needs 0021_catalog_alt_images.sql first.
--
-- A card parked by art-hash (tries = 3, no hash) that now has a backup is claimed again at once,
-- with the backup's URL. If the backup fails too, art-hash parks it at tries = 4; the 3-day look
-- then tries TCGplayer's picture again (missing → tries = 3 → the backup again), so neither
-- picture is re-tried every run. A card hashed from
-- its backup keeps the backup's URL in catalog_art.image_url, so it isn't re-hashed every run; a
-- card hashed from TCGplayer's own picture keeps TCGplayer's URL (clear_found_alt_images relies on
-- that).

drop function if exists claim_art_batch(int);
create function claim_art_batch(n int) returns table (product_id bigint, image_url text, alt boolean)
language sql security definer set search_path = public as $$
  with picked as (
    select c.product_id,
           (a.hashed_at is null and a.tries = 3 and c.image_alt_url is not null) as alt,
           case when a.hashed_at is null and a.tries = 3 and c.image_alt_url is not null then c.image_alt_url else c.image_url end as image_url
    from catalog c
    left join catalog_art a on a.product_id = c.product_id
    where c.sealed_type is null and (a.product_id is null
       or (a.hashed_at is null and a.tries < 3 and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is null and a.claimed_at < now() - interval '3 days')
       or (a.hashed_at is null and a.tries = 3 and c.image_alt_url is not null and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is not null and a.image_url is distinct from c.image_url and a.image_url is distinct from c.image_alt_url))
    order by (c.game = 'pokemon') desc, c.market_cents desc nulls last, c.product_id
    limit n
  ), claimed as (
    -- A backup attempt keeps the parked count, so a failure parks it at tries = 4.
    insert into catalog_art (product_id, claimed_at, tries)
    select p.product_id, now(), 1 from picked p
    on conflict (product_id) do update set claimed_at = now(),
      tries = case when catalog_art.tries >= 3 then catalog_art.tries else catalog_art.tries + 1 end
    returning catalog_art.product_id
  )
  select p.product_id, p.image_url, p.alt from picked p join claimed using (product_id);
$$;
revoke execute on function claim_art_batch(int) from public, anon, authenticated;

create or replace function public.run_art_hash() returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.catalog c left join public.catalog_art a on a.product_id = c.product_id
    where c.sealed_type is null and (a.product_id is null
       or (a.hashed_at is null and a.tries < 3 and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is null and a.claimed_at < now() - interval '3 days')
       or (a.hashed_at is null and a.tries = 3 and c.image_alt_url is not null and coalesce(a.claimed_at, '-infinity') < now() - interval '10 minutes')
       or (a.hashed_at is not null and a.image_url is distinct from c.image_url and a.image_url is distinct from c.image_alt_url))
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
