-- Centralized delivery assignment for water, ice, and laundry.
-- Admins assign riders. Only the assigned rider can start or complete that delivery.
-- Previous riders stay in delivery_assignment_history.

create or replace function public.is_store_owner(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = uid
      and p.role = 'seller'
      and coalesce(p.seller_team_role, 'owner') = 'owner'
      and coalesce(p.seller_join_status, 'approved') = 'approved'
  );
$$;

revoke all on function public.is_store_owner(uuid) from public;
grant execute on function public.is_store_owner(uuid) to authenticated, service_role;

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  source_kind text not null check (source_kind in ('order', 'laundry')),
  order_id uuid references public.orders(id) on delete cascade,
  laundry_booking_id uuid references public.laundry_bookings(id) on delete cascade,
  business_category text not null check (business_category in ('water', 'ice', 'mixed', 'laundry')),
  rider_id uuid references public.profiles(user_id) on delete set null,
  status text not null default 'unassigned'
    check (status in ('unassigned', 'for_delivery', 'in_transit', 'delivered', 'cancelled', 'failed')),
  assigned_by uuid references public.profiles(user_id) on delete set null,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_jobs_one_source check (
    (source_kind = 'order' and order_id is not null and laundry_booking_id is null)
    or (source_kind = 'laundry' and laundry_booking_id is not null and order_id is null)
  )
);

create unique index if not exists delivery_jobs_order_uidx
  on public.delivery_jobs(order_id)
  where order_id is not null;

create unique index if not exists delivery_jobs_laundry_uidx
  on public.delivery_jobs(laundry_booking_id)
  where laundry_booking_id is not null;

create index if not exists delivery_jobs_rider_idx on public.delivery_jobs(rider_id, status);
create index if not exists delivery_jobs_seller_idx on public.delivery_jobs(seller_id, status);

drop trigger if exists delivery_jobs_set_updated_at on public.delivery_jobs;
create trigger delivery_jobs_set_updated_at
before update on public.delivery_jobs
for each row execute function public.set_updated_at();

create table if not exists public.delivery_assignment_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  rider_id uuid not null references public.profiles(user_id) on delete restrict,
  assigned_by uuid not null references public.profiles(user_id) on delete restrict,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null check (status in ('assigned', 'in_transit', 'delivered', 'reassigned', 'cancelled', 'failed')),
  customer_name text not null default '',
  business_category text not null default 'water',
  items_summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists delivery_history_rider_idx
  on public.delivery_assignment_history(rider_id, assigned_at desc);

create unique index if not exists delivery_history_open_uidx
  on public.delivery_assignment_history(job_id)
  where released_at is null and status in ('assigned', 'in_transit');

create unique index if not exists delivery_history_completed_uidx
  on public.delivery_assignment_history(job_id)
  where status = 'delivered';

alter table public.delivery_jobs enable row level security;
alter table public.delivery_assignment_history enable row level security;

grant select on public.delivery_jobs to authenticated;
grant select on public.delivery_assignment_history to authenticated;

drop policy if exists "delivery_jobs read workspace" on public.delivery_jobs;
create policy "delivery_jobs read workspace"
on public.delivery_jobs for select
using (
  public.is_seller(auth.uid())
  and seller_id = public.seller_business_id(auth.uid())
  and (public.is_store_owner(auth.uid()) or rider_id = auth.uid())
);

drop policy if exists "delivery_history read workspace" on public.delivery_assignment_history;
create policy "delivery_history read workspace"
on public.delivery_assignment_history for select
using (
  public.is_seller(auth.uid())
  and seller_id = public.seller_business_id(auth.uid())
  and (public.is_store_owner(auth.uid()) or rider_id = auth.uid())
);

create or replace function public.delivery_order_category(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when coalesce(bool_or(coalesce(pr.category::text, 'water') = 'ice'), false)
     and coalesce(bool_or(coalesce(pr.category::text, 'water') <> 'ice'), false) then 'mixed'
    when coalesce(bool_or(coalesce(pr.category::text, 'water') = 'ice'), false) then 'ice'
    else 'water'
  end
  from public.order_items oi
  left join public.products pr on pr.id = oi.product_id
  where oi.order_id = p_order_id;
$$;

revoke all on function public.delivery_order_category(uuid) from public;
grant execute on function public.delivery_order_category(uuid) to authenticated, service_role;

create or replace function public.admin_assign_delivery(
  p_source_kind text,
  p_source_id uuid,
  p_rider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_business uuid;
  v_seller uuid;
  v_category text;
  v_customer text := '';
  v_items text := '';
  v_job public.delivery_jobs%rowtype;
  v_order_status text;
  v_laundry_status text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_store_owner(v_actor) then
    raise exception 'Only an admin can assign a rider.';
  end if;
  if p_source_kind not in ('order', 'laundry') then
    raise exception 'Unknown delivery source.';
  end if;
  if p_rider_id is null then
    raise exception 'Choose a rider.';
  end if;

  v_business := public.seller_business_id(v_actor);
  if v_business is null then
    raise exception 'Store workspace is not ready.';
  end if;

  if not exists (
    select 1
    from public.profiles r
    where r.user_id = p_rider_id
      and r.role = 'seller'
      and coalesce(r.seller_join_status, 'approved') = 'approved'
      and (
        r.user_id = v_business
        or (r.seller_team_role = 'staff' and r.seller_workspace_owner_id = v_business)
      )
  ) then
    raise exception 'That rider is not approved for this store.';
  end if;

  if p_source_kind = 'order' then
    select o.seller_id, o.status into v_seller, v_order_status
    from public.orders o
    where o.id = p_source_id;
    if v_seller is null then
      raise exception 'Order was not found.';
    end if;
    if v_seller <> v_business then
      raise exception 'This order belongs to another store.';
    end if;
    if v_order_status = 'cancelled' then
      raise exception 'Cancelled orders cannot be assigned.';
    end if;
    if v_order_status = 'delivered' then
      raise exception 'This order is already delivered.';
    end if;
    v_category := coalesce(public.delivery_order_category(p_source_id), 'water');
    select o.customer_name into v_customer from public.orders o where o.id = p_source_id;
    select coalesce(string_agg(oi.quantity::text || ' x ' || oi.product_name, ', '), '')
    into v_items
    from public.order_items oi
    where oi.order_id = p_source_id;

    insert into public.delivery_jobs (seller_id, source_kind, order_id, business_category, status)
    values (v_business, 'order', p_source_id, v_category, 'unassigned')
    on conflict (order_id) where order_id is not null do nothing;

    select * into v_job from public.delivery_jobs where order_id = p_source_id for update;
  else
    select b.seller_id, b.status into v_seller, v_laundry_status
    from public.laundry_bookings b
    where b.id = p_source_id;
    if v_seller is null then
      raise exception 'Laundry booking was not found.';
    end if;
    if v_seller <> v_business then
      raise exception 'This booking belongs to another store.';
    end if;
    if v_laundry_status = 'cancelled' then
      raise exception 'Cancelled bookings cannot be assigned.';
    end if;
    if v_laundry_status = 'completed' then
      raise exception 'This booking is already completed.';
    end if;
    v_category := 'laundry';
    select b.customer_name into v_customer from public.laundry_bookings b where b.id = p_source_id;
    select coalesce(string_agg(i.quantity::text || ' x ' || i.service_name, ', '), '')
    into v_items
    from public.laundry_booking_items i
    where i.booking_id = p_source_id;

    insert into public.delivery_jobs (seller_id, source_kind, laundry_booking_id, business_category, status)
    values (v_business, 'laundry', p_source_id, 'laundry', 'unassigned')
    on conflict (laundry_booking_id) where laundry_booking_id is not null do nothing;

    select * into v_job from public.delivery_jobs where laundry_booking_id = p_source_id for update;
  end if;

  if v_job.id is null then
    raise exception 'Could not open a delivery record.';
  end if;
  if v_job.status = 'delivered' then
    raise exception 'This delivery is already completed.';
  end if;
  if v_job.rider_id = p_rider_id and v_job.status in ('for_delivery', 'in_transit') then
    raise exception 'This delivery is already assigned to that rider.';
  end if;

  update public.delivery_assignment_history
  set status = 'reassigned', released_at = now()
  where job_id = v_job.id
    and released_at is null
    and status in ('assigned', 'in_transit');

  insert into public.delivery_assignment_history (
    job_id, seller_id, rider_id, assigned_by, assigned_at, status, customer_name, business_category, items_summary
  ) values (
    v_job.id, v_business, p_rider_id, v_actor, now(), 'assigned', coalesce(v_customer, ''), v_category, coalesce(v_items, '')
  );

  update public.delivery_jobs
  set rider_id = p_rider_id,
      status = 'for_delivery',
      assigned_by = v_actor,
      assigned_at = now(),
      started_at = null,
      completed_at = null,
      business_category = v_category
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'rider_id', v_job.rider_id,
    'status', v_job.status,
    'assigned_at', v_job.assigned_at
  );
end;
$$;

revoke all on function public.admin_assign_delivery(text, uuid, uuid) from public;
grant execute on function public.admin_assign_delivery(text, uuid, uuid) to authenticated;

create or replace function public.rider_update_delivery(
  p_job_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if p_action not in ('start', 'deliver') then
    raise exception 'Unknown delivery action.';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'Delivery was not found.';
  end if;
  if v_job.rider_id is distinct from v_actor then
    raise exception 'Only the assigned rider can update this delivery.';
  end if;

  if p_action = 'start' then
    if v_job.status <> 'for_delivery' then
      raise exception 'This delivery is not waiting to start.';
    end if;
    update public.delivery_assignment_history
    set status = 'in_transit', started_at = now()
    where job_id = v_job.id
      and rider_id = v_actor
      and released_at is null
      and status = 'assigned';
    update public.delivery_jobs
    set status = 'in_transit', started_at = now()
    where id = v_job.id
    returning * into v_job;
    if v_job.order_id is not null then
      update public.orders
      set status = 'on_the_way'
      where id = v_job.order_id
        and status not in ('delivered', 'cancelled');
    end if;
    if v_job.laundry_booking_id is not null then
      update public.laundry_bookings
      set status = 'in_progress'
      where id = v_job.laundry_booking_id
        and status not in ('completed', 'cancelled');
    end if;
  else
    if v_job.status <> 'in_transit' then
      raise exception 'Start the delivery before marking it delivered.';
    end if;
    if exists (
      select 1 from public.delivery_assignment_history h
      where h.job_id = v_job.id and h.status = 'delivered'
    ) then
      raise exception 'This delivery is already completed.';
    end if;
    update public.delivery_assignment_history
    set status = 'delivered', completed_at = now()
    where job_id = v_job.id
      and rider_id = v_actor
      and released_at is null
      and status = 'in_transit';
    if not found then
      raise exception 'This delivery is already completed.';
    end if;
    update public.delivery_jobs
    set status = 'delivered', completed_at = now()
    where id = v_job.id
    returning * into v_job;
    if v_job.order_id is not null then
      update public.orders
      set status = 'delivered'
      where id = v_job.order_id
        and status <> 'cancelled';
    end if;
    if v_job.laundry_booking_id is not null then
      update public.laundry_bookings
      set status = 'completed'
      where id = v_job.laundry_booking_id
        and status <> 'cancelled';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', v_job.status,
    'started_at', v_job.started_at,
    'completed_at', v_job.completed_at
  );
end;
$$;

revoke all on function public.rider_update_delivery(uuid, text) from public;
grant execute on function public.rider_update_delivery(uuid, text) to authenticated;

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
  if public.is_store_owner(auth.uid()) or auth.uid() = v_rider then
    return new;
  end if;
  raise exception 'Only the assigned rider can update this delivery.';
end;
$$;

drop trigger if exists orders_guard_assigned_delivery on public.orders;
create trigger orders_guard_assigned_delivery
before update on public.orders
for each row execute function public.orders_guard_assigned_delivery();

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
  if public.is_store_owner(auth.uid()) or auth.uid() = v_rider then
    return new;
  end if;
  raise exception 'Only the assigned rider can update this delivery.';
end;
$$;

drop trigger if exists laundry_guard_assigned_delivery on public.laundry_bookings;
create trigger laundry_guard_assigned_delivery
before update on public.laundry_bookings
for each row execute function public.laundry_guard_assigned_delivery();

alter table public.delivery_jobs replica identity full;
alter table public.delivery_assignment_history replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.delivery_jobs;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.delivery_assignment_history;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.laundry_bookings;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
