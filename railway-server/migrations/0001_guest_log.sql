-- 0001_guest_log.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- guest_log: one row per guest LOGIN (identify / classroom_join), so guest
-- sessions are captured even when the guest never submits an answer. The cr
-- server's presence (the doge "Online Now" feed + the Live Classroom avatar
-- registry) is IN-MEMORY only, so without this table a browse-only guest leaves
-- no trace at all. Written by railway-server/server.js::logGuestSession via the
-- ANON key (debounced 5 min per guest). Idempotent / safe to re-run.

create table if not exists public.guest_log (
  id          bigint generated always as identity primary key,
  username    text not null,
  surface     text,            -- 'desk' | 'worksheet' | 'quiz' | 'study-guide' | 'classroom'
  lesson      text,            -- optional lesson context (e.g. 'U3 L6')
  section     text,            -- classroom section for a classroom_join
  event       text not null default 'identify',  -- 'identify' | 'classroom_join'
  created_at  timestamptz not null default now()
);

create index if not exists guest_log_created_idx  on public.guest_log (created_at desc);
create index if not exists guest_log_username_idx on public.guest_log (username);

-- The cr server writes with the ANON key (same as the answers table). Allow the
-- anon role to INSERT (server writes) + SELECT (the /api/guest-log read).
alter table public.guest_log enable row level security;

do $$ begin
  create policy guest_log_anon_insert on public.guest_log for insert to anon with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy guest_log_anon_select on public.guest_log for select to anon using (true);
exception when duplicate_object then null; end $$;
