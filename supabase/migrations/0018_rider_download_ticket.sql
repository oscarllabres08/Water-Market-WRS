-- Short-lived tickets so the rider APK is not a public file.
-- A correct download PIN creates a ticket. The site only serves the APK when that ticket is present.

create table if not exists public.rider_download_tickets (
  token uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null
);

alter table public.rider_download_tickets enable row level security;
revoke all on table public.rider_download_tickets from public, anon, authenticated;

create or replace function public.claim_rider_download_ticket(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_token uuid;
begin
  if public.verify_seller_download_pin(p_pin) is not true then
    return null;
  end if;

  delete from public.rider_download_tickets
  where expires_at < now() - interval '1 day';

  insert into public.rider_download_tickets (expires_at)
  values (now() + interval '10 minutes')
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.rider_download_ticket_valid(p_token uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.rider_download_tickets
    where token = p_token
      and expires_at > now()
  );
$$;

revoke all on function public.claim_rider_download_ticket(text) from public;
grant execute on function public.claim_rider_download_ticket(text) to anon, authenticated, service_role;

revoke all on function public.rider_download_ticket_valid(uuid) from public;
grant execute on function public.rider_download_ticket_valid(uuid) to anon, authenticated, service_role;
