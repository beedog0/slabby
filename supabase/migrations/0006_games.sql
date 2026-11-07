-- One Piece and Riftbound alongside Pokémon. Existing rows are Pokémon.
-- Apply before installing the build that adds other games: the app syncs the new columns.

alter table slabs add column if not exists game text not null default 'pokemon'
  check (game in ('pokemon', 'onepiece', 'riftbound'));
-- PSA's Variety line ("PARALLEL", "MANGA"). One Piece and Riftbound reuse card numbers across
-- printings, so for them it is part of the card_key.
alter table slabs add column if not exists variety text;

alter table card_refs add column if not exists game text not null default 'pokemon';
-- Where TCGCSV keeps the product, for games priced from TCGplayer directly (not PokemonPriceTracker).
alter table card_refs add column if not exists tcgcsv_category int;
alter table card_refs add column if not exists tcgcsv_group int;
-- False when the match is another language's printing: its photo is used, its price is not.
alter table card_refs add column if not exists priced boolean not null default true;
