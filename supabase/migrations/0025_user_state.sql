-- Accounts: everything the phone keeps for you, saved to your account so it survives a reinstall
-- or a new phone. One row per on-device store ("slabby.vault", "slabby.wishlist",
-- "slabby.corrections", ...), holding that store's saved JSON as is. The vault is also synced row
-- by row in `slabs` (nightly prices read it); this copy keeps every field, including ones that
-- have no column yet (con buys, wishlist, scan corrections, shelf order).
--
-- Numbered 0025 so it sorts after the open search branch's 0024. Safe to re-run.

create table if not exists user_state (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table user_state enable row level security;

drop policy if exists "own state" on user_state;
create policy "own state" on user_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists user_state_touch on user_state;
create trigger user_state_touch before update on user_state
  for each row execute function touch_updated_at();
