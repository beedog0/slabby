-- Raw card scan: every priced printing of a card (Normal, Holofoil, Reverse Holofoil, 1st Edition…)
-- with its TCGplayer market, so the scan sheet can offer the print a photo can't tell apart.
-- Filled by catalog-import from tonight's run; empty until then.

alter table catalog add column if not exists printings jsonb not null default '[]'::jsonb;

create or replace function upsert_catalog(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into catalog as c (
    product_id, category_id, group_id, game, language, name, number, rarity, set_name, set_code,
    image_url, market_cents, low_cents, updated_on, market_hist, printings
  )
  select r.product_id, r.category_id, r.group_id, r.game, r.language, r.name, r.number, r.rarity,
         r.set_name, r.set_code, r.image_url, r.market_cents, r.low_cents, r.updated_on,
         case when r.market_cents is null then '{}'::int[] else array[r.market_cents] end,
         coalesce(r.printings, '[]'::jsonb)
  from jsonb_to_recordset(rows) as r(
    product_id bigint, category_id int, group_id int, game text, language text, name text,
    number text, rarity text, set_name text, set_code text, image_url text, market_cents int,
    low_cents int, updated_on date, printings jsonb
  )
  on conflict (product_id) do update set
    category_id = excluded.category_id, group_id = excluded.group_id, game = excluded.game,
    language = excluded.language, name = excluded.name, number = excluded.number,
    rarity = excluded.rarity, set_name = excluded.set_name, set_code = excluded.set_code,
    image_url = excluded.image_url, market_cents = excluded.market_cents,
    low_cents = excluded.low_cents, updated_on = excluded.updated_on, printings = excluded.printings,
    market_hist = case
      when excluded.market_cents is null then c.market_hist
      else last_n(
        (case when c.updated_on = excluded.updated_on and array_length(c.market_hist, 1) > 0
              then c.market_hist[1:array_length(c.market_hist, 1) - 1]
              else c.market_hist end)
        || excluded.market_cents,
        31)
    end;
  get diagnostics n = row_count;
  update catalog set change_7d = hist_change(market_hist, 7), change_30d = hist_change(market_hist, 30)
  where product_id in (select (x->>'product_id')::bigint from jsonb_array_elements(rows) x);
  return n;
end $$;
revoke execute on function upsert_catalog(jsonb) from public, anon, authenticated;
grant execute on function upsert_catalog(jsonb) to service_role;
