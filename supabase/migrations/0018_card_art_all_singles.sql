-- Card art for every single, numbered or not. 0016 fingerprinted only cards with a printed
-- number, which left out old promos that print none ("Ancient Mew", "Birthday Pikachu", WotC
-- black star promos the catalog lists without a number): exactly the cards a photo has to
-- identify by art. Singles are now everything that isn't sealed product (0015_sealed.sql).
-- catalog-import keeps those number-less singles from tonight's run.

create or replace function claim_art_batch(n int) returns table (product_id bigint, image_url text)
language sql security definer set search_path = public as $$
  with picked as (
    select c.product_id, c.image_url
    from catalog c
    left join catalog_art a on a.product_id = c.product_id
    where c.sealed_type is null and (a.product_id is null
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

create or replace function art_status() returns table (cards int, hashed int, failed int)
language sql security definer set search_path = public as $$
  select (select count(*)::int from catalog where sealed_type is null),
         (select count(*)::int from catalog_art where hashed_at is not null),
         (select count(*)::int from catalog_art where hashed_at is null and tries >= 3);
$$;

create or replace function public.run_art_hash() returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.catalog c left join public.catalog_art a on a.product_id = c.product_id
    where c.sealed_type is null and (a.product_id is null
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
