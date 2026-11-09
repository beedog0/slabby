-- Forgiving card search. "Kai sa", "kaisa" and "Kai’Sa" (the iPhone types a curly apostrophe) all
-- find Kai'Sa; "pokemon" finds "Pokémon"; "ho oh" and "hooh" find Ho-Oh. A name typed exactly
-- comes first, then names that start with it, then the rest. Only when that finds nothing at all
-- does a close misspelling ("charzard") count, and those always sit below the real matches.
--
-- Results now go to 250 (the app asked for 60, so a name with many printings, like Greninja, lost
-- "Mega Greninja ex - 116/086" off the end).
--
-- Builds on 0020_art_type.sql (search_cards keeps the same arguments, so app builds don't change).
-- The same folding runs on the phone in src/services/search.ts (fold); change both together.

create extension if not exists pg_trgm;

-- Lowercase, accents off, apostrophes removed, every other punctuation mark a space.
create or replace function search_fold(s text)
returns text
language sql immutable parallel safe as $$
  select trim(regexp_replace(regexp_replace(
    translate(lower(coalesce(s, '')),
      'àáâãäåāăąçćčďèéêëēĕėęěìíîïīĭįıñńňòóôõöøōŏőùúûüūŭůűųýÿžźżšśşť',
      'aaaaaaaaacccdeeeeeeeeeiiiiiiiinnnooooooooouuuuuuuuuyyzzzssst'),
    '[''’‘`´ʼ]', '', 'g'),
    '[!-/:-@\[-`{-~“”–—…·•\s]+', ' ', 'g'));
$$;

-- The name folded (for "starts with" and misspellings), and everything a search can hit: the name,
-- the name with its spaces taken out, set, set code and number.
alter table catalog add column if not exists name_norm text
  generated always as (search_fold(name)) stored;
alter table catalog add column if not exists search_norm text
  generated always as (
    search_fold(name) || ' ' || replace(search_fold(name), ' ', '') || ' ' || search_fold(set_name) || ' '
    || search_fold(set_code) || ' ' || search_fold(number)
  ) stored;
-- The name without TCGplayer's " - 205/165", " (Alternate Art)" or Riftbound's ", Daughter of the
-- Void", folded, spaces out: what an exactly typed name is compared with.
alter table catalog add column if not exists name_key text
  generated always as (
    replace(search_fold(split_part(split_part(split_part(name, ' - ', 1), ' (', 1), ', ', 1)), ' ', '')
  ) stored;
create index if not exists catalog_search_norm_trgm on catalog using gin (search_norm gin_trgm_ops);
create index if not exists catalog_name_norm_trgm on catalog using gin (name_norm gin_trgm_ops);

-- Every card a search finds, with its tier: 0 the name typed exactly (ignoring the " - 205/165",
-- " (Alternate Art)" or ", Daughter of the Void" after it), 1 the name starts with it, 2 the name holds it, 3 every
-- word is somewhere in name, set or number, 4 a close misspelling of the name.
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
        when c.name_norm like (select s from qn) || '%'
          or c.name_key like replace((select s from qn), ' ', '') || '%' then 1
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
  -- Misspellings: only the words with letters are compared with the name; any number typed must
  -- still be there exactly. Only tried when nothing matches for real.
  words as (select string_agg(t, ' ') as w from terms where t ~ '[a-z]' and t !~ '[0-9]'),
  fuzzy as (
    select c.product_id, 4 as tier, word_similarity((select w from words), c.name_norm) as score
    from catalog c
    where not exists (select 1 from strict)
      and length(coalesce((select w from words), '')) >= 4
      and (game_filter is null or c.game = game_filter)
      -- 0.45, not the <% operator's 0.6 ("charzard" scores 0.58 against "charizard"). Setting
      -- the operator's threshold on the function is refused on Supabase once pg_trgm is loaded.
      and word_similarity((select w from words), c.name_norm) >= 0.45
      and not exists (select 1 from terms where terms.t ~ '[0-9]' and position(terms.t in c.search_norm) = 0)
  )
  select * from strict
  union all
  select * from fuzzy;
$$;
grant execute on function search_hits(text, text) to authenticated;

drop function if exists search_cards(text, text, int, text[], int[], text[], text, text[], text[]);
create or replace function search_cards(
  q text,
  game_filter text default null,
  lim int default 60,
  lang_filter text[] default null,
  group_filter int[] default null,
  rarity_filter text[] default null,
  sort text default 'best',
  type_filter text[] default null,
  art_filter text[] default null
)
returns setof catalog
language sql stable set search_path = public as $$
  with h as (
    select * from search_hits(q, game_filter)
    union all
    -- A set picked with nothing typed browses the set.
    select c.product_id, 0, 0::real from catalog c
    where search_fold(q) = '' and group_filter is not null and c.group_id = any (group_filter)
      and (game_filter is null or c.game = game_filter)
  )
  select c.* from h join catalog c on c.product_id = h.product_id
  where (lang_filter is null or c.language = any (lang_filter))
    and (group_filter is null or c.group_id = any (group_filter))
    and (rarity_filter is null or c.rarity = any (rarity_filter))
    and (type_filter is null
         or ('card' = any (type_filter) and c.sealed_type is null)
         or ('sealed' = any (type_filter) and c.sealed_type is not null)
         or c.sealed_type = any (type_filter))
    and (art_filter is null or c.art_type = any (art_filter))
    and (sort not in ('rise_7d', 'drop_7d') or c.change_7d is not null)
    and (sort not in ('rise_30d', 'drop_30d') or c.change_30d is not null)
  order by
    h.tier = 4,  -- misspellings never jump above real matches, whatever the sort
    case when sort = 'price_high' then c.market_cents end desc nulls last,
    case when sort = 'price_low' then c.market_cents end asc nulls last,
    case when sort = 'name' then c.name end asc,
    case when sort = 'rise_7d' then c.change_7d end desc,
    case when sort = 'drop_7d' then c.change_7d end asc,
    case when sort = 'rise_30d' then c.change_30d end desc,
    case when sort = 'drop_30d' then c.change_30d end asc,
    h.tier,
    h.score desc,
    c.market_cents desc nulls last
  limit least(lim, 250);  -- was 100: "greninja" has more than 60 printings and the last ones were cut
$$;
grant execute on function search_cards(text, text, int, text[], int[], text[], text, text[], text[]) to authenticated;

-- Facets count the same cards the search shows.
create or replace function search_cards_facets(q text, game_filter text default null, lang_filter text[] default null)
returns table (kind text, key text, label text, n bigint)
language sql stable set search_path = public as $$
  with m as (
    select c.language, c.group_id, c.set_name, c.rarity, c.sealed_type, c.art_type
    from search_hits(q, game_filter) h join catalog c on c.product_id = h.product_id
  )
  select 'language', language, language, count(*) from m group by language
  union all
  select 'set', group_id::text, min(set_name), count(*) from m
    where lang_filter is null or language = any (lang_filter) group by group_id
  union all
  select 'rarity', rarity, rarity, count(*) from m
    where rarity is not null and (lang_filter is null or language = any (lang_filter)) group by rarity
  union all
  select 'type', coalesce(sealed_type, 'card'), coalesce(sealed_type, 'card'), count(*) from m
    where lang_filter is null or language = any (lang_filter) group by sealed_type
  union all
  select 'art', art_type, art_type, count(*) from m
    where art_type is not null and (lang_filter is null or language = any (lang_filter)) group by art_type
  order by 1, 4 desc;
$$;
grant execute on function search_cards_facets(text, text, text[]) to authenticated;

-- The older single-box search (trade picker, quick add) uses the same matching. The live one is
-- 0010's 7-argument version (its filters moved to search_cards in 0012 and no build still sends
-- them); leaving it next to a 3-argument one would make the app's call ambiguous.
drop function if exists search_catalog(text, text, int, text, int, text[], text);
drop function if exists search_catalog(text, text, int);
create function search_catalog(q text, game_filter text default null, lim int default 40)
returns setof catalog
language sql stable set search_path = public as $$
  select * from search_cards(q, game_filter, least(lim, 60));
$$;
grant execute on function search_catalog(text, text, int) to authenticated;
