-- Card search: our own copy of TCGplayer's catalog (via TCGCSV) for Pokémon EN/JP, One Piece and
-- Riftbound, refreshed every night by catalog-import. Searching only reads this table; it never
-- calls a paid API. Opening a card calls card-prices, which spends PokemonPriceTracker credits
-- from its own daily allowance and caches the answer for a day.

create extension if not exists pg_trgm;

create table catalog (
  product_id bigint primary key,      -- TCGplayer product id (= PPT tcgPlayerId)
  category_id int not null,
  group_id int not null,
  game text not null,                 -- pokemon | onepiece | riftbound
  language text not null,             -- en | ja
  name text not null,
  number text,
  rarity text,
  set_name text not null,
  set_code text,
  image_url text not null,
  market_cents int,                   -- TCGplayer market, latest night
  low_cents int,
  updated_on date not null default current_date,
  search text generated always as (
    lower(name || ' ' || set_name || ' ' || coalesce(set_code, '') || ' ' || coalesce(number, ''))
  ) stored
);
create index catalog_search_trgm on catalog using gin (search gin_trgm_ops);
create index catalog_game_idx on catalog (game);

alter table catalog enable row level security;
create policy "read catalog" on catalog for select to authenticated using (true);

-- Import cursor: one row per set. catalog-import works through the sets not done today.
create table catalog_groups (
  category_id int not null,
  group_id int not null,
  name text not null,
  abbreviation text,
  imported_on date,
  primary key (category_id, group_id)
);
create table catalog_categories (
  category_id int primary key,
  groups_on date                      -- day the set list was last refreshed
);
alter table catalog_groups enable row level security;      -- Edge Functions only
alter table catalog_categories enable row level security;

-- Opened cards: PPT's answer (raw + PSA 10/9/8 with history), reused for 24 hours.
create table search_cache (
  product_id bigint primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table search_cache enable row level security;        -- Edge Functions only

-- PPT credit ledger per day and bucket. Search has its own cap so it can't eat into what scans
-- and the nightly vault refresh need (PPT allows 20,000 a day).
create table ppt_credits (
  day date not null default current_date,
  bucket text not null,
  credits int not null default 0,
  primary key (day, bucket)
);
alter table ppt_credits enable row level security;         -- Edge Functions only

-- Atomically spend n credits from a bucket's daily cap. False (and nothing spent) when over.
create or replace function claim_ppt_credits(bucket_name text, n int, daily_cap int) returns boolean
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  insert into ppt_credits (day, bucket, credits) values (current_date, bucket_name, n)
  on conflict (day, bucket) do update set credits = ppt_credits.credits + n
  returning credits into used;
  if used > daily_cap then
    update ppt_credits set credits = credits - n where day = current_date and bucket = bucket_name;
    return false;
  end if;
  return true;
end $$;
revoke execute on function claim_ppt_credits(text, int, int) from public, anon, authenticated;
grant execute on function claim_ppt_credits(text, int, int) to service_role;

-- Search: every word must appear (name, set, set code or number); best name match first.
create or replace function search_catalog(q text, game_filter text default null, lim int default 40)
returns setof catalog
language sql stable set search_path = public as $$
  with terms as (
    select t from unnest(regexp_split_to_array(lower(trim(regexp_replace(q, '[#/,]', ' ', 'g'))), '\s+')) t
    where t <> ''
  )
  select c.* from catalog c
  where (game_filter is null or c.game = game_filter)
    and exists (select 1 from terms)
    and not exists (select 1 from terms where position(terms.t in c.search) = 0)
    and c.search like '%' || (select t from terms order by length(t) desc limit 1) || '%'
  order by similarity(c.name, q) desc, c.market_cents desc nulls last
  limit least(lim, 60);
$$;
grant execute on function search_catalog(text, text, int) to authenticated;

-- Fires catalog-import once (one batch of sets). Same cron token as comps-nightly (0005_cron.sql).
create or replace function public.run_catalog_import() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://yiojhrauddycaktjhfma.supabase.co/functions/v1/catalog-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpb2pocmF1ZGR5Y2FrdGpoZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDQ1OTAsImV4cCI6MjA5Nzg4MDU5MH0.XxlmeKkVkRo6TuHYeDOsl7XNwo16t2XQLOfNJJQMKtI',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'comps_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
$$;
revoke execute on function public.run_catalog_import() from public, anon, authenticated;

-- TCGCSV refreshes around 20:00 UTC. Every 2 minutes from 21:00 to 23:58 UTC, each run imports
-- the next batch of sets not done today; once all are done a run returns right away.
select cron.schedule('catalog-import', '*/2 21-23 * * *', 'select public.run_catalog_import()');
