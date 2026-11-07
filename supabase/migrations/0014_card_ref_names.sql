-- The matched product's card name ("Pikachu ex"), so the app can replace a label read that
-- missed the name (e.g. "PZA" from a 2024 SV8a label). Filled by card-match; old rows are
-- named the next time the app asks card-match about them.
alter table card_refs add column if not exists matched_name text;
