-- The last 5 sales per vault card for the app's headline price (src/pricing/lastSales.ts):
-- for each card_key, the newest days in sales_daily up to and including the day that reaches 5
-- sales, within `since` (the app passes 180 days back). Returns at most a handful of rows per
-- card, so the vault loads its headlines in one call however long its history is.

create or replace function last_sale_days(keys text[], since date, n int default 5)
returns table (card_key text, day date, sales int, avg_cents int)
language sql stable security invoker
set search_path = public
as $$
  select card_key, day, sales, avg_cents
  from (
    select s.card_key, s.day, s.sales, s.avg_cents,
      coalesce(sum(s.sales) over (partition by s.card_key order by s.day desc rows between unbounded preceding and 1 preceding), 0) as before
    from sales_daily s
    where s.card_key = any(keys) and s.day >= since and s.sales > 0 and s.avg_cents > 0
  ) t
  where before < n
  order by card_key, day desc;
$$;

grant execute on function last_sale_days(text[], date, int) to authenticated;
