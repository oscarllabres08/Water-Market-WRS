-- Store staff using the rider app can change an order or laundry status
-- even when the delivery job is assigned to another rider in the same store.

create or replace function public.orders_guard_assigned_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rider uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.delivery_jobs
    set status = 'cancelled'
    where order_id = new.id
      and status not in ('delivered', 'cancelled');
    update public.delivery_assignment_history h
    set status = 'cancelled', released_at = now()
    where h.released_at is null
      and h.status in ('assigned', 'in_transit')
      and h.job_id in (select j.id from public.delivery_jobs j where j.order_id = new.id);
    return new;
  end if;
  if new.status not in ('on_the_way', 'delivered') then
    return new;
  end if;
  select j.rider_id into v_rider
  from public.delivery_jobs j
  where j.order_id = new.id
    and j.rider_id is not null
    and j.status in ('for_delivery', 'in_transit', 'delivered');
  if v_rider is null then
    return new;
  end if;
  if public.is_store_owner(auth.uid())
     or auth.uid() = v_rider
     or (
       public.is_seller(auth.uid())
       and public.seller_business_id(auth.uid()) is not distinct from new.seller_id
     ) then
    return new;
  end if;
  raise exception 'Only store staff can update this delivery.';
end;
$$;

create or replace function public.laundry_guard_assigned_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rider uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.delivery_jobs
    set status = 'cancelled'
    where laundry_booking_id = new.id
      and status not in ('delivered', 'cancelled');
    update public.delivery_assignment_history h
    set status = 'cancelled', released_at = now()
    where h.released_at is null
      and h.status in ('assigned', 'in_transit')
      and h.job_id in (select j.id from public.delivery_jobs j where j.laundry_booking_id = new.id);
    return new;
  end if;
  if new.status not in ('in_progress', 'completed') then
    return new;
  end if;
  select j.rider_id into v_rider
  from public.delivery_jobs j
  where j.laundry_booking_id = new.id
    and j.rider_id is not null
    and j.status in ('for_delivery', 'in_transit', 'delivered');
  if v_rider is null then
    return new;
  end if;
  if public.is_store_owner(auth.uid())
     or auth.uid() = v_rider
     or (
       public.is_seller(auth.uid())
       and public.seller_business_id(auth.uid()) is not distinct from new.seller_id
     ) then
    return new;
  end if;
  raise exception 'Only store staff can update this delivery.';
end;
$$;
