-- Recent sales behind a tap (Slab detail → comps row → sales screen).
--
-- PokemonPriceTracker on our plan gives daily {average, count} per grade, so sales_daily holds one
-- row per day that had a sale. Individual sold listings (soldListings) come only on PPT's Business
-- plan; when they are in the response, refreshProduct also writes them to sales. The app reads
-- sales first and falls back to sales_daily. Written by Edge Functions only (service role).

create table sales_daily (
  card_key text not null,
  day date not null,
  sales int not null,               -- sold count that day (eBay + Fanatics Collect)
  avg_cents int not null,           -- that day's average sold price
  primary key (card_key, day)
);

create table sales (
  card_key text not null,
  source text not null,             -- 'ebay' | 'fanatics' | …
  listing_id text not null,
  sold_day date not null,
  sold_at timestamptz,              -- null when the source gives only a day
  price_cents int not null,
  kind text check (kind in ('auction', 'bin', 'offer')),
  title text,
  url text,
  primary key (card_key, source, listing_id) -- one listing can be written under several card_keys
);
create index sales_card_day on sales (card_key, sold_day desc);

alter table sales_daily enable row level security;
alter table sales enable row level security;
create policy "read sales daily" on sales_daily for select to authenticated using (true);
create policy "read sales" on sales for select to authenticated using (true);
