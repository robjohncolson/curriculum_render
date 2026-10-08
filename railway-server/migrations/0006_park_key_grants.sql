-- 0006_park_key_grants.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs, after 0005)
--
-- Teacher 2026-10-08 (PICO_DESK_SPEC "Candy economy", items 7-9): campaign keys can be bought with
-- candy. roster-server debits the candy (its POST /wallet/buy-key) and then calls the relay's
-- POST /park/campaign/keys/grant with a receipt id. The relay records the receipt and adds one
-- bought key in ONE transaction, so a retried grant with the same receipt id never adds a second
-- key, and a key is never added without its receipt.
--
-- Bought keys live in their own column, park_campaign_wallet.bought, written ONLY by
-- park_campaign_grant_key. The relay's own saves stay absolute rows of `keys` (earned - spent) and
-- never touch `bought`, so a save can never overwrite a committed purchase. The unspent count a
-- player sees is keys + bought; spending a bought key drives `keys` below zero, so the 0005
-- "keys >= 0" check becomes "keys + bought >= 0". A bought key is identical to an earned one.
--
-- Until this runs, a grant fails (the relay answers 503; roster-server holds the candy and retries).
-- Idempotent / safe to re-run.

alter table public.park_campaign_wallet add column if not exists bought integer not null default 0;
alter table public.park_campaign_wallet drop constraint if exists park_campaign_wallet_keys_check;
alter table public.park_campaign_wallet drop constraint if exists park_campaign_wallet_unspent_check;
alter table public.park_campaign_wallet add constraint park_campaign_wallet_unspent_check
  check (bought >= 0 and keys + bought >= 0);

create table if not exists public.park_campaign_key_grants (
  receipt_id  text        primary key,
  section     text        not null,    -- the relay's park room key (as in park_campaign_wallet)
  username    text        not null,
  granted_at  timestamptz not null default now()
);

-- Returns { granted, bought }: granted = this receipt was new (one key added); bought = the player's
-- stored bought-key count AFTER this call (the authoritative number, fresh or duplicate).
drop function if exists public.park_campaign_grant_key(text, text, text);
create function public.park_campaign_grant_key(
  p_section text, p_username text, p_receipt text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_fresh boolean; v_bought integer;
begin
  insert into public.park_campaign_key_grants (receipt_id, section, username)
  values (p_receipt, p_section, p_username)
  on conflict (receipt_id) do nothing;
  v_fresh := found;
  if v_fresh then
    insert into public.park_campaign_wallet (section, username, keys, bought, cleared, updated_at)
    values (p_section, p_username, 0, 1, '{}', now())
    on conflict (section, username) do update
      set bought = public.park_campaign_wallet.bought + 1, updated_at = now();
  end if;
  select coalesce(max(bought), 0) into v_bought from public.park_campaign_wallet
   where section = p_section and username = p_username;
  return jsonb_build_object('granted', v_fresh, 'bought', v_bought);
end;
$$;

revoke all on function public.park_campaign_grant_key(text, text, text) from public, anon, authenticated;
grant execute on function public.park_campaign_grant_key(text, text, text) to service_role;

-- Deliberately ZERO RLS policies (as 0005): only the backend service role reads or writes.
alter table public.park_campaign_key_grants enable row level security;
revoke all on table public.park_campaign_key_grants from anon, authenticated;
