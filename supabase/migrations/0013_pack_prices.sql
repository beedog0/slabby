-- Sell after a scan: "Pulled it" rates a sale against what one booster pack of the card's set
-- costs. catalog-import reads it from the set's sealed products (TCGCSV, free) each night.
-- Null until tonight's run, or for sets with no single pack on TCGplayer; the app then treats a
-- pull as $0 cost ("Pure profit").

alter table catalog_groups add column if not exists pack_name text;
alter table catalog_groups add column if not exists pack_cents int;

-- Set names, codes and pack prices are public TCGplayer data; the app reads them directly.
drop policy if exists "read catalog groups" on catalog_groups;
create policy "read catalog groups" on catalog_groups for select to authenticated using (true);
