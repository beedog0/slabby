-- users: Supabase auth

create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  cert_number text,                 -- PSA cert, null for raw
  grader text check (grader in ('psa','bgs','cgc','raw')) not null default 'psa',
  grade numeric(3,1),               -- 10, 9.5, null for raw
  name text not null,               -- "Mew ex"
  set_name text,                    -- "151"
  set_code text,                    -- "SV2a"
  number text,                      -- "205"
  language text default 'en',
  year int,
  image_front_url text,
  image_back_url text,
  paid_cents int,
  paid_at date,
  plan text check (plan in ('hold','sell','trade')) default 'hold',
  floor_override_cents int,         -- per-card override of the rule
  ask_override_cents int,
  status text check (status in ('owned','sold')) default 'owned',
  sold_cents int,
  sold_at timestamptz,
  sold_where text,                  -- "Collect-A-Con Nov 2026"
  created_at timestamptz default now()
);

create table cert_cache (            -- shared across all users
  cert_number text primary key,
  grader text not null,
  payload jsonb not null,           -- raw PSA response
  fetched_at timestamptz default now()
);

create table price_points (          -- one row per comp observed
  id bigserial primary key,
  card_key text not null,           -- "psa:10:SV2a:205:ja" — identity independent of the user's copy
  source text check (source in ('ebay_sold','tcgplayer_market')) not null,
  price_cents int not null,
  observed_at timestamptz not null,
  listing_id text,
  unique (source, listing_id)
);

create table price_daily (           -- materialized by an edge function nightly
  card_key text not null,
  day date not null,
  market_cents int,                 -- median of ebay_sold trailing 30d
  low_cents int, high_cents int,
  sales_30d int,
  primary key (card_key, day)
);

create table pricing_rules (
  user_id uuid primary key references auth.users,
  ask_pct numeric default 10,       -- market +10%
  floor_pct numeric default -5,     -- 30d low −5%
  never_below_paid boolean default true,
  buy_target_pct numeric default -15,
  buy_max_pct numeric default -5,
  round_to_cents int default 500,
  graded_source text default 'ebay_sold',
  raw_source text default 'tcgplayer_market'
);

create table con_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- Row-level security. Per-user tables are keyed by user_id; shared price/cert tables are
-- readable by any signed-in user and written only by Edge Functions (service role bypasses RLS).
alter table cards enable row level security;
alter table pricing_rules enable row level security;
alter table con_sessions enable row level security;
alter table cert_cache enable row level security;
alter table price_points enable row level security;
alter table price_daily enable row level security;

create policy "own cards" on cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rules" on pricing_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own con sessions" on con_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read certs" on cert_cache for select to authenticated using (true);
create policy "read price points" on price_points for select to authenticated using (true);
create policy "read price daily" on price_daily for select to authenticated using (true);

create index cards_user_idx on cards (user_id, status);
create index price_points_key_idx on price_points (card_key, observed_at desc);
