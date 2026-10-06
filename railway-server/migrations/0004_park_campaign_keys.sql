-- 0004_park_campaign_keys.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- park_campaign_keys: one row per student who earned the Pico Park campaign key by finishing a
-- calculator team activity. Keys are permanent (entering the campaign never uses one up), so
-- there is no count. `section` is the relay's park room key (Periods B and E share the room
-- 'park:periods-b-e'). Written and read only by railway-server/apstat-park with the backend
-- service key; the relay keeps working memory-only when this table is missing.
-- Idempotent / safe to re-run.

create table if not exists public.park_campaign_keys (
  section    text        not null,
  username   text        not null,
  earned_at  timestamptz not null default now(),
  source     text,
  primary key (section, username)
);

-- Deliberately ZERO RLS policies: only the backend service role (which bypasses RLS) reads or
-- writes keys; the browser-visible anon key must not be able to grant itself one.
alter table public.park_campaign_keys enable row level security;
revoke all on table public.park_campaign_keys from anon, authenticated;
