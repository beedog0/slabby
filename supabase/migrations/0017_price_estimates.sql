-- Price estimates for cards with no price source (Korean and Chinese promos, some old JP promos).
-- price-estimate writes one row per card_key when the user taps "Find a price": an AI web search
-- for sold listings, kept 7 days. It is never a comp: nothing here feeds price_daily, and the app
-- labels it "Estimate" with the links it came from. Spend is capped per day in ppt_credits under
-- the "estimate" bucket (ESTIMATE_DAILY_CAP, default 100), separate from the PPT and vision buckets.
-- Numbered after 0016_card_art (PR #45); it doesn't depend on it.

create table price_estimates (
  card_key text primary key,
  found_at timestamptz not null default now(),
  price_cents int,                    -- median of the sales; null when the search found none
  low_cents int,
  high_cents int,
  sales jsonb not null default '[]',  -- [{ title, url, source, priceCents, amount, currency, soldOn }]
  searches int not null default 0,    -- web searches the model ran (for cost checks)
  model text
);

alter table price_estimates enable row level security;
create policy "read price estimates" on price_estimates for select to authenticated using (true);
