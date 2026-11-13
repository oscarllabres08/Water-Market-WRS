-- Store the customer's pin with a laundry booking so staff can open the route.

alter table public.laundry_bookings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

drop function if exists public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb);

create or replace function public.create_public_laundry_booking(
  p_customer_name text,
  p_contact_number text,
  p_address text,
  p_scheduled_for timestamptz,
  p_notes text,
  p_items jsonb,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_phone text := trim(coalesce(p_contact_number, ''));
  v_booking_id uuid;
  v_item jsonb;
  v_service_id uuid;
  v_qty int;
  v_service record;
  v_summary text := '';
  v_count int := 0;
begin
  if char_length(v_name) < 2 then
    raise exception 'Enter the customer name.';
  end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'Enter a contact number.';
  end if;
  if p_scheduled_for is null or p_scheduled_for < now() - interval '1 hour' then
    raise exception 'Choose a pickup schedule.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Choose at least one laundry service.';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Location is not valid.';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Location is not valid.';
  end if;
  if (p_latitude is null) is distinct from (p_longitude is null) then
    raise exception 'Location is not valid.';
  end if;

  select o.user_id into v_owner
  from public.profiles o
  where o.role = 'seller'
    and coalesce(o.seller_team_role, 'owner') = 'owner'
    and coalesce(o.seller_join_status, 'approved') = 'approved'
  order by o.created_at asc
  limit 1;

  if v_owner is null then
    raise exception 'Laundry booking is not open yet.';
  end if;

  insert into public.laundry_bookings (
    seller_id, customer_name, contact_number, address, latitude, longitude,
    service_summary, scheduled_for, notes, status, source
  )
  values (
    v_owner,
    v_name,
    v_phone,
    nullif(trim(coalesce(p_address, '')), ''),
    p_latitude,
    p_longitude,
    'Pending',
    p_scheduled_for,
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending',
    'website'
  )
  returning id into v_booking_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_service_id := nullif(v_item->>'service_id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Each service needs a quantity from 1 to 50.';
    end if;

    select id, name, price, unit_label
    into v_service
    from public.laundry_services
    where id = v_service_id
      and seller_id = v_owner
      and is_available = true;

    if not found then
      raise exception 'A laundry service is no longer available.';
    end if;

    insert into public.laundry_booking_items (booking_id, service_id, service_name, unit_price, quantity)
    values (v_booking_id, v_service.id, v_service.name, v_service.price, v_qty);

    v_summary := v_summary || case when v_summary = '' then '' else ', ' end
      || v_qty::text || ' ' || v_service.unit_label || ' ' || v_service.name;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Choose at least one laundry service.';
  end if;

  update public.laundry_bookings
  set service_summary = v_summary
  where id = v_booking_id;

  return jsonb_build_object('ok', true, 'booking_id', v_booking_id);
end;
$$;

revoke all on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb, double precision, double precision) from public;
grant execute on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb, double precision, double precision) to anon;
grant execute on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb, double precision, double precision) to authenticated;
