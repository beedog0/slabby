-- Local-first sync: the app generates card ids (uuid) so offline adds keep their identity.
alter table cards add column condition text;   -- raw cards: "near mint"
alter table cards add column updated_at timestamptz default now();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger cards_touch before update on cards for each row execute function touch_updated_at();
