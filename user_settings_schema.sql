-- user_settings — cross-device sync of per-user, per-app parameters.
--
-- Identity = the same "sync name" (the Fruit_Animal username) the user types on
-- each device. One JSON blob per (username, app_id); last write wins.
--
-- Apply this in the PRODUCTION Supabase project SQL editor:
--   https://bzqbhtrurzzavhqbgqrs.supabase.co  (Dashboard -> SQL Editor -> New query)
--
-- Mirrors the project's existing convention (anon key, allow-all RLS, grant to anon)
-- so the browser can read/write it directly with no server code — see frq_grades_schema.sql.

create table if not exists public.user_settings (
  username    text        not null,
  app_id      text        not null,                       -- 'sa730', 'kilo_build', 'curriculum', ...
  data        jsonb       not null default '{}'::jsonb,    -- the app's whole param blob
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (username, app_id)
);

create index if not exists user_settings_username_idx on public.user_settings (username);

alter table public.user_settings enable row level security;

-- Allow-all, matching the rest of this project. NOTE: with the public anon key,
-- anyone who knows a sync name can read/overwrite that name's params. Fine for
-- low-stakes settings (tracker state, app preferences) — do NOT store secrets here.
drop policy if exists "user_settings allow all" on public.user_settings;
create policy "user_settings allow all"
  on public.user_settings for all
  using (true) with check (true);

grant select, insert, update, delete on public.user_settings to anon;

-- Keep updated_at honest on every UPDATE.
create or replace function public.user_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_settings_touch_trg on public.user_settings;
create trigger user_settings_touch_trg
  before update on public.user_settings
  for each row execute function public.user_settings_touch();
