-- 0009_park_calc_srs.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- APSTAT_PARK_TRAINER_ABSORB_SPEC section 5 (spaced recall in the relay, 2026-10-16).
-- park_calc_srs: one row per student per calculator skill per park room: the SM-2 record the
--   relay advances on every completed calculator round (interval 1 -> 6 -> x ease, ease floor 1.3,
--   ported from the v2 trainer). `mastered` flips on the first solo clear with no hints at quality
--   >= 4, or on the handheld check; it is what pays the solo door's bonus point (section 6).
-- `section` is the relay's park room key (Periods B and E share 'park:periods-b-e'); `skill_id` is
-- the catalogue skillId (e.g. 'one-var-stats'). Rows are whole records; the relay is the only writer.
-- Written and read only by railway-server/apstat-park with the backend service key; the relay
-- keeps working memory-only when this table is missing.
-- Idempotent / safe to re-run.

create table if not exists public.park_calc_srs (
  section        text        not null,
  username       text        not null,
  skill_id       text        not null,
  repetitions    integer     not null default 0 check (repetitions >= 0),
  interval_days  integer     not null default 0 check (interval_days >= 0),
  ease           real        not null default 2.5 check (ease >= 1.3),
  next_review    date,
  last_quality   integer     check (last_quality is null or (last_quality >= 0 and last_quality <= 5)),
  mastered       boolean     not null default false,
  updated_at     timestamptz not null default now(),
  primary key (section, username, skill_id)
);

create index if not exists park_calc_srs_due_idx on public.park_calc_srs (section, username, next_review);

-- Deliberately ZERO RLS policies: only the backend service role (which bypasses RLS) reads or
-- writes records; the browser-visible anon key must not be able to reschedule its own reviews.
alter table public.park_calc_srs enable row level security;
revoke all on table public.park_calc_srs from anon, authenticated;
