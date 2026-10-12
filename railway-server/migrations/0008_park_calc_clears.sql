-- 0008_park_calc_clears.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- APSTAT_PARK_CALCULATOR_FLUENCY_SPEC section 1 (teacher 2026-10-12: hint rungs follow the student).
-- park_calc_clears: one row per student per calculator skill per park room: how many calculator
--   team rounds the student was on when the team completed that skill. The relay turns it into the
--   hint rung (0 = full hints, 1 = goals only, 2+ = no hints).
-- `section` is the relay's park room key (Periods B and E share 'park:periods-b-e'); `skill_id` is
-- the catalogue skillId (e.g. 'one-var-stats'). Rows are absolute counts; the relay is the only writer.
-- Written and read only by railway-server/apstat-park with the backend service key; the relay
-- keeps working memory-only when this table is missing.
-- Idempotent / safe to re-run.

create table if not exists public.park_calc_clears (
  section     text        not null,
  username    text        not null,
  skill_id    text        not null,
  clears      integer     not null default 0 check (clears >= 0),
  updated_at  timestamptz not null default now(),
  primary key (section, username, skill_id)
);

-- Deliberately ZERO RLS policies: only the backend service role (which bypasses RLS) reads or
-- writes clears; the browser-visible anon key must not be able to skip its own hints.
alter table public.park_calc_clears enable row level security;
revoke all on table public.park_calc_clears from anon, authenticated;
