-- PSA public API quota tracking and the overflow queue (TECH.md services/psa.ts step 4).
create table psa_calls (
  day date primary key default current_date,
  calls int not null default 0
);

create table psa_queue (
  cert_number text primary key,
  requested_by uuid references auth.users,
  queued_at timestamptz default now()
);

alter table psa_calls enable row level security;   -- Edge Functions only (service role)
alter table psa_queue enable row level security;

-- Atomically claim one call against today's quota. Returns false when the quota is spent.
create or replace function claim_psa_call(daily_limit int) returns boolean
language plpgsql security definer as $$
declare used int;
begin
  insert into psa_calls (day, calls) values (current_date, 1)
  on conflict (day) do update set calls = psa_calls.calls + 1
  returning calls into used;
  if used > daily_limit then
    update psa_calls set calls = calls - 1 where day = current_date;
    return false;
  end if;
  return true;
end $$;

revoke execute on function claim_psa_call(int) from public, anon, authenticated;
