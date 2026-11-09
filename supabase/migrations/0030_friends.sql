-- Friends and public showcases.
--
-- friend_requests: one row per pair of people, from whoever asked. Pending until the other person
-- accepts; either can delete it (decline, cancel, or unfriend). Both people need a profile row
-- (0029), so a request always has a name and handle to show.
--
-- showcases: the slabs and numbers you show others, built on the phone (src/profile/publicProfile.ts).
-- No prices paid, asks, floors, sold prices or cert numbers ever go here. Who can read it follows
-- your audience: everyone signed in, friends only, or nobody but you.

create table if not exists public.friend_requests (
  from_id uuid not null references public.profiles (user_id) on delete cascade,
  to_id uuid not null references public.profiles (user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

-- One row per pair, whichever way round it was asked.
create unique index if not exists friend_requests_pair on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id));
create index if not exists friend_requests_to on public.friend_requests (to_id);

alter table public.friend_requests enable row level security;

drop policy if exists "see own requests" on public.friend_requests;
create policy "see own requests" on public.friend_requests for select to authenticated
  using (auth.uid() in (from_id, to_id));

drop policy if exists "send a request" on public.friend_requests;
create policy "send a request" on public.friend_requests for insert to authenticated
  with check (
    auth.uid() = from_id and status = 'pending' and accepted_at is null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- Only the person asked can accept, and accepting is the only change allowed.
drop policy if exists "accept a request" on public.friend_requests;
create policy "accept a request" on public.friend_requests for update to authenticated
  using (auth.uid() = to_id) with check (auth.uid() = to_id and status = 'accepted');

drop policy if exists "end a request" on public.friend_requests;
create policy "end a request" on public.friend_requests for delete to authenticated
  using (auth.uid() in (from_id, to_id));

create or replace function public.friend_requests_accept() returns trigger language plpgsql as $$
begin
  if new.from_id <> old.from_id or new.to_id <> old.to_id or new.created_at <> old.created_at then
    raise exception 'only status can change';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' then new.accepted_at := now(); end if;
  return new;
end $$;

drop trigger if exists friend_requests_accept on public.friend_requests;
create trigger friend_requests_accept before update on public.friend_requests
  for each row execute function public.friend_requests_accept();

-- True when a and b are friends. Security definer so showcase policies can ask without the caller
-- being able to read other people's requests.
create or replace function public.are_friends(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'accepted' and ((from_id = a and to_id = b) or (from_id = b and to_id = a))
  )
$$;
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- How many friends someone has, for their public profile. Counts only, never who.
create or replace function public.friend_count(u uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.friend_requests where status = 'accepted' and u in (from_id, to_id)
$$;
revoke all on function public.friend_count(uuid) from public;
grant execute on function public.friend_count(uuid) to authenticated;

create table if not exists public.showcases (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  audience text not null default 'friends' check (audience in ('everyone', 'friends', 'nobody')),
  -- { stats: {...}, cards: [...] } as built by buildShowcase; capped well above 24 slabs.
  showcase jsonb not null,
  updated_at timestamptz not null default now(),
  check (pg_column_size(showcase) <= 200000)
);

alter table public.showcases enable row level security;

drop policy if exists "read showcases you're allowed" on public.showcases;
create policy "read showcases you're allowed" on public.showcases for select to authenticated
  using (
    auth.uid() = user_id
    or audience = 'everyone'
    or (audience = 'friends' and public.are_friends(auth.uid(), user_id))
  );

drop policy if exists "own showcase insert" on public.showcases;
create policy "own showcase insert" on public.showcases for insert to authenticated
  with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "own showcase update" on public.showcases;
create policy "own showcase update" on public.showcases for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own showcase delete" on public.showcases;
create policy "own showcase delete" on public.showcases for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists showcases_touch on public.showcases;
create trigger showcases_touch before update on public.showcases for each row execute function public.profiles_touch();
