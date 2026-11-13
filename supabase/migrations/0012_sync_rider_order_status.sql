-- When a rider changes the order status, keep the delivery job and its history on the same status
-- so Delivery Management and Delivery history show that status with a date and time.

create or replace function public.sync_delivery_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_job public.delivery_jobs%rowtype;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_job
  from public.delivery_jobs
  where order_id = new.id;

  if v_job.id is null or v_job.rider_id is null or v_job.status in ('delivered', 'cancelled') then
    return new;
  end if;

  if new.status = 'on_the_way' and v_job.status = 'for_delivery' then
    update public.delivery_jobs
    set status = 'in_transit',
        started_at = coalesce(started_at, now())
    where id = v_job.id;
    update public.delivery_assignment_history
    set status = 'in_transit',
        started_at = coalesce(started_at, now())
    where job_id = v_job.id
      and rider_id = v_job.rider_id
      and released_at is null
      and status = 'assigned';
  elsif new.status = 'delivered' and v_job.status in ('for_delivery', 'in_transit') then
    update public.delivery_jobs
    set status = 'delivered',
        started_at = coalesce(started_at, now()),
        completed_at = coalesce(completed_at, now())
    where id = v_job.id;
    update public.delivery_assignment_history
    set status = 'delivered',
        started_at = coalesce(started_at, now()),
        completed_at = coalesce(completed_at, now())
    where job_id = v_job.id
      and rider_id = v_job.rider_id
      and released_at is null
      and status in ('assigned', 'in_transit');
  elsif new.status in ('pending', 'confirmed', 'preparing') and v_job.status = 'in_transit' then
    update public.delivery_jobs
    set status = 'for_delivery',
        started_at = null
    where id = v_job.id;
    update public.delivery_assignment_history
    set status = 'assigned',
        started_at = null
    where job_id = v_job.id
      and rider_id = v_job.rider_id
      and released_at is null
      and status = 'in_transit';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_sync_delivery_status on public.orders;
create trigger orders_sync_delivery_status
after update of status on public.orders
for each row execute function public.sync_delivery_from_order();

create or replace function public.sync_delivery_from_laundry()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_job public.delivery_jobs%rowtype;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_job
  from public.delivery_jobs
  where laundry_booking_id = new.id;

  if v_job.id is null or v_job.rider_id is null or v_job.status in ('delivered', 'cancelled') then
    return new;
  end if;

  if new.status = 'in_progress' and v_job.status = 'for_delivery' then
    update public.delivery_jobs
    set status = 'in_transit',
        started_at = coalesce(started_at, now())
    where id = v_job.id;
    update public.delivery_assignment_history
    set status = 'in_transit',
        started_at = coalesce(started_at, now())
    where job_id = v_job.id
      and rider_id = v_job.rider_id
      and released_at is null
      and status = 'assigned';
  elsif new.status = 'completed' and v_job.status in ('for_delivery', 'in_transit') then
    update public.delivery_jobs
    set status = 'delivered',
        started_at = coalesce(started_at, now()),
        completed_at = coalesce(completed_at, now())
    where id = v_job.id;
    update public.delivery_assignment_history
    set status = 'delivered',
        started_at = coalesce(started_at, now()),
        completed_at = coalesce(completed_at, now())
    where job_id = v_job.id
      and rider_id = v_job.rider_id
      and released_at is null
      and status in ('assigned', 'in_transit');
  end if;

  return new;
end;
$$;

drop trigger if exists laundry_sync_delivery_status on public.laundry_bookings;
create trigger laundry_sync_delivery_status
after update of status on public.laundry_bookings
for each row execute function public.sync_delivery_from_laundry();

update public.delivery_jobs j
set status = 'delivered',
    completed_at = coalesce(j.completed_at, o.updated_at, now())
from public.orders o
where j.order_id = o.id
  and o.status = 'delivered'
  and j.status in ('for_delivery', 'in_transit');

update public.delivery_assignment_history h
set status = 'delivered',
    completed_at = coalesce(h.completed_at, j.completed_at, now())
from public.delivery_jobs j
where h.job_id = j.id
  and j.status = 'delivered'
  and h.released_at is null
  and h.status in ('assigned', 'in_transit');

update public.delivery_jobs j
set status = 'in_transit',
    started_at = coalesce(j.started_at, o.updated_at, now())
from public.orders o
where j.order_id = o.id
  and o.status = 'on_the_way'
  and j.status = 'for_delivery';

update public.delivery_assignment_history h
set status = 'in_transit',
    started_at = coalesce(h.started_at, j.started_at, now())
from public.delivery_jobs j
where h.job_id = j.id
  and j.status = 'in_transit'
  and h.released_at is null
  and h.status = 'assigned';
