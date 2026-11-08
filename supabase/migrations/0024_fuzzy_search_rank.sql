-- Misspellings ranked better. 0023 ordered close misspellings by word_similarity, which scores
-- part-word overlaps: "charzard" put "Hard Charm" and "Code Card - Charizard ex Special
-- Collection" above every Charizard. Which cards count as a misspelling is unchanged; only their
-- order is. Same arguments as 0023, so nothing else changes. Also drops 0023's function-level
-- SET of pg_trgm.word_similarity_threshold (Supabase refuses to set it once pg_trgm is loaded)
-- in favour of an explicit word_similarity >= 0.45.

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
    select c.product_id, 4 as tier,
      -- Ranked by how well the typed words fit whole words of the name, plus how close the
      -- typed text is to the card's own name: plain word_similarity put "Hard Charm" above
      -- Charizard for "charzard" (har, ard, cha overlap).
      (strict_word_similarity((select w from words), c.name_norm)
       + similarity(replace((select w from words), ' ', ''), c.name_key))::real as score
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
