-- Public profiles: the name, @handle, bio and photo you'd share, and that friends will search by.
-- One row per signed-in account; guests never publish. Handles are unique and link-safe.
-- Anyone signed in (guests included) can read profiles; only you can write yours.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9]([a-z0-9]|[._](?![._]))*[a-z0-9]$' and char_length(handle) between 3 and 20),
  name text check (char_length(name) <= 40),
  bio text check (char_length(bio) <= 120),
  -- Small square JPEG data URI (~20 KB). Moves to Storage when sharing lands.
  photo text check (char_length(photo) <= 200000),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable" on public.profiles for select to authenticated using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert to authenticated
  with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile delete" on public.profiles;
create policy "own profile delete" on public.profiles for delete to authenticated using (auth.uid() = user_id);

create or replace function public.profiles_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.profiles_touch();
