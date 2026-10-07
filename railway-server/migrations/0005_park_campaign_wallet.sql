-- 0005_park_campaign_wallet.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- Teacher 2026-10-07: campaign keys are a spendable COUNT (supersedes 0004's "a key is a permanent
-- door unlock"). Every roster member of a completed calculator team round earns +1 key; a key is
-- spent to open the next campaign stage for the whole park room.
--
-- park_campaign_wallet: one row per student per park room: the unspent key count and the stage
--   indexes the student has cleared (0-based, the relay's stageIndex: 0 = 1-1, 47 = 12-4).
-- park_campaign_open: the stages opened for a park room (0-based index). Stage 0 (1-1) is always
--   open and is never stored.
-- `section` is the relay's park room key (Periods B and E share 'park:periods-b-e').
-- Written and read only by railway-server/apstat-park with the backend service key; the relay
-- keeps working memory-only when these tables are missing.
-- Idempotent / safe to re-run (re-running also carries over any 0004 holder who has no wallet row yet).

create table if not exists public.park_campaign_wallet (
  section     text        not null,
  username    text        not null,
  keys        integer     not null default 0 check (keys >= 0),
  cleared     integer[]   not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (section, username)
);

create table if not exists public.park_campaign_open (
  section    text        not null,
  stage      integer     not null check (stage between 1 and 47),
  opened_by  text,
  opened_at  timestamptz not null default now(),
  primary key (section, stage)
);

-- Keep the 0004 data meaningful: every existing key holder starts with one unspent key.
-- A holder who already has a wallet row is left alone (never re-granted).
do $$
begin
  if to_regclass('public.park_campaign_keys') is not null then
    insert into public.park_campaign_wallet (section, username, keys)
    select section, username, 1 from public.park_campaign_keys
    on conflict (section, username) do nothing;
  end if;
end $$;

-- A spend writes BOTH sides in one transaction: the spender's wallet row (absolute: the relay is
-- the only writer) and the opened stage. Either both persist or neither does, so a restart can never
-- find a debit without its stage or a stage opened without a debit. A stage already stored keeps its
-- first opener.
create or replace function public.park_campaign_spend_key(
  p_section text, p_stage integer, p_username text, p_keys integer, p_cleared integer[], p_opened_by text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.park_campaign_wallet (section, username, keys, cleared, updated_at)
  values (p_section, p_username, p_keys, coalesce(p_cleared, '{}'), now())
  on conflict (section, username) do update
    set keys = excluded.keys, cleared = excluded.cleared, updated_at = excluded.updated_at;
  insert into public.park_campaign_open (section, stage, opened_by)
  values (p_section, p_stage, p_opened_by)
  on conflict (section, stage) do nothing;
end;
$$;

revoke all on function public.park_campaign_spend_key(text, integer, text, integer, integer[], text) from public, anon, authenticated;
grant execute on function public.park_campaign_spend_key(text, integer, text, integer, integer[], text) to service_role;

-- Deliberately ZERO RLS policies: only the backend service role (which bypasses RLS) reads or
-- writes these; the browser-visible anon key must not be able to grant itself keys or stages.
alter table public.park_campaign_wallet enable row level security;
alter table public.park_campaign_open enable row level security;
revoke all on table public.park_campaign_wallet from anon, authenticated;
revoke all on table public.park_campaign_open from anon, authenticated;
