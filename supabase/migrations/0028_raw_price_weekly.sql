-- Raw price history back to Feb 2024 for the 1Y / All chart. TCGCSV's daily archives
-- (tcgcsv.com/archive/tcgplayer, from 2024-02-08) sampled once a week: one row per product,
-- cents[i] = TCGplayer market on from_day + 7*i (null when it had none that week).
-- Loaded once by hand from the Mac; card-prices puts it ahead of PPT's 180 daily days.
-- About 80k rows of ~145 ints, so a few tens of MB.

create table if not exists raw_price_weekly (
  product_id bigint primary key,
  from_day date not null,
  cents int[] not null
);

alter table raw_price_weekly enable row level security;   -- Edge Functions only (service role)
