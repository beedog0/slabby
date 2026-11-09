-- Card nicknames in search: "scream pikachu" (or "pikachu scream") finds the Japanese SM-P 288
-- Pikachu, "moonbreon" the Evolving Skies Umbreon VMAX alt art. A nickname typed exactly ranks
-- first, like an exactly typed name (0023). The app shows "aka Scream Pikachu" under the name so
-- it's clear why the card came up.
--
-- Nicknames are rules, not product ids: game, language, words the TCGplayer name must hold, and
-- optionally the number and words of the set. So a card the nightly import adds later (another
-- printing, a fixed name) picks up its nickname on its own. Our own hand-checked list, never
-- copied from another app.
--
-- Builds on 0023/0024 (search_fold, search_norm, search_hits).

create table if not exists card_aliases (
  id bigint generated always as identity primary key,
  alias text not null,              -- as shown: "Scream Pikachu"
  game text not null,               -- pokemon | onepiece | riftbound
  language text,                    -- en | ja; null = any
  name_has text not null,           -- folded words the name must hold: 'umbreon vmax'
  number_is text,                   -- folded number, or its first part: '215 203' or '215'
  set_has text,                     -- folded words of set name or set code: 'evolving skies'
  note text,
  created_at timestamptz not null default now()
);
alter table card_aliases enable row level security;  -- the app reads nicknames through catalog.aka

-- The card's nicknames, kept on the row so search and the app read them with the card.
alter table catalog add column if not exists aka text[];

create or replace function alias_fits(a card_aliases, game text, language text, name text, number text,
                                      set_name text, set_code text)
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select a.game = game
    and (a.language is null or a.language = language)
    and position(a.name_has in search_fold(name)) > 0
    and (a.number_is is null or search_fold(number) = a.number_is
         or split_part(search_fold(number), ' ', 1) = a.number_is)
    and (a.set_has is null or position(a.set_has in search_fold(set_name) || ' ' || search_fold(set_code)) > 0);
$$;

-- A row the import adds or renames gets its nicknames straight away.
create or replace function catalog_set_aka() returns trigger
language plpgsql set search_path = public as $$
begin
  -- In the order they were added, so the main nickname (added first) is the one the app shows.
  new.aka := (select array_agg(x.alias order by x.first_id) from (
                select a.alias, min(a.id) as first_id from card_aliases a
                where alias_fits(a, new.game, new.language, new.name, new.number, new.set_name, new.set_code)
                group by a.alias) x);
  return new;
end $$;
drop trigger if exists catalog_aka on catalog;
create trigger catalog_aka before insert or update of name, number, set_name, set_code, language, game on catalog
  for each row execute function catalog_set_aka();

-- After changing card_aliases: re-tag every card. Returns each nickname with how many cards it
-- found, so a rule that found 0 (wrong number format, name spelled differently) stands out.
create or replace function refresh_card_aliases()
returns table (alias text, cards bigint)
language plpgsql security definer set search_path = public as $$
begin
  update catalog c set aka = x.aka
  from (
    select c2.product_id,
      (select array_agg(y.alias order by y.first_id) from (
         select a.alias, min(a.id) as first_id from card_aliases a
         where alias_fits(a, c2.game, c2.language, c2.name, c2.number, c2.set_name, c2.set_code)
         group by a.alias) y) as aka
    from catalog c2
  ) x
  where c.product_id = x.product_id and c.aka is distinct from x.aka;
  return query
    select a.alias, count(c.product_id) from card_aliases a
    left join catalog c on alias_fits(a, c.game, c.language, c.name, c.number, c.set_name, c.set_code)
    group by a.id, a.alias order by 2, 1;
end $$;
revoke execute on function refresh_card_aliases() from public, anon, authenticated;

-- Nicknames join what a search can hit. array_to_string isn't immutable, so a small wrapper.
create or replace function aka_text(aka text[]) returns text
language sql immutable parallel safe as $$ select coalesce(array_to_string(aka, ' '), '') $$;

drop index if exists catalog_search_norm_trgm;
alter table catalog drop column if exists search_norm;
alter table catalog add column search_norm text
  generated always as (
    search_fold(name) || ' ' || replace(search_fold(name), ' ', '') || ' ' || search_fold(set_name) || ' '
    || search_fold(set_code) || ' ' || search_fold(number) || ' ' || search_fold(aka_text(aka)) || ' '
    || replace(search_fold(aka_text(aka)), ' ', '')
  ) stored;
create index catalog_search_norm_trgm on catalog using gin (search_norm gin_trgm_ops);

-- 0024's search_hits, plus: a nickname typed exactly is tier 0, and a nickname holding every
-- typed word ("pikachu scream") tier 1.
create or replace function search_hits(q text, game_filter text default null)
returns table (product_id bigint, tier int, score real)
language sql stable set search_path = public, extensions as $$
  with qn as (select search_fold(q) as s),
  terms as (
    select t from unnest(regexp_split_to_array((select s from qn), ' ')) t where t <> ''
  ),
  strict as (
    select c.product_id,
      case
        when c.name_key = replace((select s from qn), ' ', '') then 0
        when c.aka is not null and exists (
          select 1 from unnest(c.aka) a where replace(search_fold(a), ' ', '') = replace((select s from qn), ' ', '')) then 0
        when c.name_norm like (select s from qn) || '%'
          or c.name_key like replace((select s from qn), ' ', '') || '%' then 1
        when c.aka is not null and not exists (
          select 1 from terms where position(terms.t in search_fold(aka_text(c.aka))) = 0) then 1
        when c.name_norm like '%' || (select s from qn) || '%' then 2
        else 3
      end as tier,
      similarity(c.name_norm, (select s from qn)) as score
    from catalog c
    where (game_filter is null or c.game = game_filter)
      and exists (select 1 from terms)
      and not exists (select 1 from terms where position(terms.t in c.search_norm) = 0)
      and c.search_norm like '%' || (select t from terms order by length(t) desc limit 1) || '%'
  ),
  words as (select string_agg(t, ' ') as w from terms where t ~ '[a-z]' and t !~ '[0-9]'),
  fuzzy as (
    select c.product_id, 4 as tier,
      (strict_word_similarity((select w from words), c.name_norm)
       + similarity(replace((select w from words), ' ', ''), c.name_key))::real as score
    from catalog c
    where not exists (select 1 from strict)
      and length(coalesce((select w from words), '')) >= 4
      and (game_filter is null or c.game = game_filter)
      and word_similarity((select w from words), c.name_norm) >= 0.45
      and not exists (select 1 from terms where terms.t ~ '[0-9]' and position(terms.t in c.search_norm) = 0)
  )
  select * from strict
  union all
  select * from fuzzy;
$$;
grant execute on function search_hits(text, text) to authenticated;

-- First list: nicknames collectors actually use, each checked against the card. Add more with an
-- insert here (or in the SQL editor) and then `select * from refresh_card_aliases();`.
insert into card_aliases (alias, game, language, name_has, number_is, set_has, note) values
  ('Scream Pikachu', 'pokemon', 'ja', 'pikachu', '288', 'sm p', 'Munch: A Retrospective promo 288/SM-P'),
  ('Munch Pikachu',  'pokemon', 'ja', 'pikachu', '288', 'sm p', 'same card as Scream Pikachu'),
  ('Moonbreon',      'pokemon', 'en', 'umbreon vmax', '215', 'evolving skies', 'alt art 215/203'),
  ('Moonbreon',      'pokemon', 'ja', 'umbreon vmax', '095', 'eevee heroes', 'SA 095/069'),
  ('Bubble Mew',     'pokemon', 'en', 'mew ex', '232', 'paldean fates', 'SIR 232/091'),
  ('Bubble Mew',     'pokemon', 'ja', 'mew ex', '347', 'shiny treasure', 'SAR 347/190'),
  ('Van Gogh Pikachu', 'pokemon', 'en', 'grey felt hat', null, null, 'Van Gogh Museum promo SVP 085');

select * from refresh_card_aliases();
