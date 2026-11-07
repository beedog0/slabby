-- Comps freshness and on-demand refresh (comps-refresh Edge Function).
--
-- price_daily can't say when a sale happened (graded rows exist for every day with a sale in the
-- trailing 30 days; raw rows carry forward), so the last sale is taken from the source when the
-- comps are written, and stored next to when they were written.

alter table card_refs add column comps_refreshed_at timestamptz;  -- last successful write of price_daily
alter table card_refs add column comps_attempted_at timestamptz;  -- last on-demand claim (cooldown lock)
alter table card_refs add column last_sale_day date;              -- graded: latest day with a sale; raw: latest market point
alter table card_refs add column last_sale_cents int;

-- On-demand refresh budget per user per day. The global budget is the all-zeros user.
create table comps_refresh_calls (
  user_id uuid not null,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table comps_refresh_calls enable row level security;   -- Edge Functions only (service role)

-- Claim one on-demand refresh of a card_key, in one transaction:
--   1. take the cooldown lock (comps_attempted_at) on a matched card_refs row; the cooldown runs
--      from the later of the last claim and the last successful write (nightly included),
--   2. count the call against the user's and the global daily budget, like claim_psa_call.
-- Over a budget, the counts and the lock are put back. Returns
-- 'ok' | 'fresh' (attempted or written within the cooldown) | 'no_match' | 'user_limit' | 'global_limit'.
create or replace function claim_comps_refresh(
  p_user uuid, p_key text, p_cooldown interval, p_user_limit int, p_global_limit int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  global_id constant uuid := '00000000-0000-0000-0000-000000000000';
  prev timestamptz;
  locked boolean;
  used int;
begin
  select comps_attempted_at into prev from card_refs where card_key = p_key and tcgplayer_id is not null;
  if not found then return 'no_match'; end if;

  update card_refs set comps_attempted_at = now()
  where card_key = p_key
    and tcgplayer_id is not null
    and greatest(coalesce(comps_attempted_at, '-infinity'), coalesce(comps_refreshed_at, '-infinity')) < now() - p_cooldown;
  get diagnostics used = row_count;
  locked := used > 0;
  if not locked then return 'fresh'; end if;

  insert into comps_refresh_calls (user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = comps_refresh_calls.calls + 1
  returning calls into used;
  if used > p_user_limit then
    update comps_refresh_calls set calls = calls - 1 where user_id = p_user and day = current_date;
    update card_refs set comps_attempted_at = prev where card_key = p_key;
    return 'user_limit';
  end if;

  insert into comps_refresh_calls (user_id, day, calls) values (global_id, current_date, 1)
  on conflict (user_id, day) do update set calls = comps_refresh_calls.calls + 1
  returning calls into used;
  if used > p_global_limit then
    update comps_refresh_calls set calls = calls - 1 where user_id = global_id and day = current_date;
    update comps_refresh_calls set calls = calls - 1 where user_id = p_user and day = current_date;
    update card_refs set comps_attempted_at = prev where card_key = p_key;
    return 'global_limit';
  end if;

  return 'ok';
end $$;

revoke execute on function claim_comps_refresh(uuid, text, interval, int, int) from public, anon, authenticated;
