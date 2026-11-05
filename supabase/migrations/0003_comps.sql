-- Comps via PokemonPriceTracker (eBay + Fanatics sold for graded, TCGplayer market for raw).
-- card_refs maps a card_key to its TCGplayer product once, shared across users.

create table card_refs (
  card_key text primary key,
  language text not null default 'en',
  tcgplayer_id text,               -- null = no match yet; the user can fix the card's details
  image_url text,                  -- card photo for the slab window and thumbnails
  matched_set text,
  matched_at timestamptz default now()
);

alter table card_refs enable row level security;
create policy "read card refs" on card_refs for select to authenticated using (true);

alter table cards add column card_key text;
create index cards_card_key_idx on cards (card_key);

-- price_points stays in the schema for a future source with individual sales; PPT gives daily
-- aggregates, so comps-nightly writes price_daily directly.

-- Nightly at 09:00 UTC (after PPT's daily refresh). Needs the pg_cron and pg_net extensions and
-- two Vault secrets: project_url and service_role_key.
-- select cron.schedule('comps-nightly', '0 9 * * *', $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/comps-nightly',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     timeout_milliseconds := 600000
--   );
-- $$);
