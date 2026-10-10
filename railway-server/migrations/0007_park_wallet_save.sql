-- 0007_park_wallet_save.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs, after 0006)
--
-- Fix (2026-10-09): after a player spends a BOUGHT key, the relay's in-memory `keys` is negative
-- (keys = earned - spent; the bought key lives in `bought`). The relay saved wallet rows with
-- INSERT ... ON CONFLICT DO UPDATE without `bought`; Postgres checks the CHECK constraint on the
-- proposed INSERT tuple (bought = default 0, so keys + bought < 0) BEFORE the conflict path runs, so
-- every such save failed with park_campaign_wallet_unspent_check and was retried forever. The same
-- happened inside park_campaign_spend_key (0005), so the spend's opened stage was never stored either.
--
-- Both writes now UPDATE the existing row (keys, cleared; never bought) and INSERT only when there is
-- no row yet (a new player: bought = 0). `bought` stays written only by park_campaign_grant_key (0006).
-- Idempotent / safe to re-run.

-- Save one player's absolute keys + cleared stages. Never touches bought.
create or replace function public.park_campaign_save(
  p_section text, p_username text, p_keys integer, p_cleared integer[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.park_campaign_wallet
     set keys = p_keys, cleared = coalesce(p_cleared, '{}'), updated_at = now()
   where section = p_section and username = p_username;
  if found then return; end if;
  insert into public.park_campaign_wallet (section, username, keys, bought, cleared, updated_at)
  values (p_section, p_username, p_keys, 0, coalesce(p_cleared, '{}'), now())
  on conflict (section, username) do nothing;
  if found then return; end if;
  -- A concurrent writer created the row between the UPDATE and the INSERT: update it.
  update public.park_campaign_wallet
     set keys = p_keys, cleared = coalesce(p_cleared, '{}'), updated_at = now()
   where section = p_section and username = p_username;
end;
$$;

revoke all on function public.park_campaign_save(text, text, integer, integer[]) from public, anon, authenticated;
grant execute on function public.park_campaign_save(text, text, integer, integer[]) to service_role;

-- 0005's spend, same signature and meaning (the spender's absolute row + the opened stage in ONE
-- transaction), with the wallet write going through park_campaign_save.
create or replace function public.park_campaign_spend_key(
  p_section text, p_stage integer, p_username text, p_keys integer, p_cleared integer[], p_opened_by text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.park_campaign_save(p_section, p_username, p_keys, p_cleared);
  insert into public.park_campaign_open (section, stage, opened_by)
  values (p_section, p_stage, p_opened_by)
  on conflict (section, stage) do nothing;
end;
$$;

revoke all on function public.park_campaign_spend_key(text, integer, text, integer, integer[], text) from public, anon, authenticated;
grant execute on function public.park_campaign_spend_key(text, integer, text, integer, integer[], text) to service_role;
