-- WaterMarket: laundry records, guest ice orders, and stock for ice.
-- Run once, in its own SQL Editor execution, after 0002_ice_category.sql has committed.
-- Does not delete orders, products, customers, or sales.

alter table public.orders alter column customer_id drop not null;

alter table public.orders add column if not exists order_source text not null default 'app';

alter table public.orders drop constraint if exists orders_order_source_check;
alter table public.orders add constraint orders_order_source_check
  check (order_source in ('app', 'website'));

-- Guest website orders have no customer account, so loyalty must not write a null customer.
create or replace function public.apply_order_loyalty_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_pts int;
  v_body text;
  v_loyalty_on boolean;
begin
  if new.status is distinct from 'delivered' then
    return new;
  end if;
  if old.status = 'delivered' then
    return new;
  end if;
  if new.customer_id is null then
    return new;
  end if;
  if lower(coalesce(new.payment_method, '')) = 'utang' then
    return new;
  end if;
  if exists (select 1 from public.order_loyalty_awards ola where ola.order_id = new.id) then
    return new;
  end if;

  select coalesce(p.loyalty_points_active, false) into v_loyalty_on
  from public.profiles p
  where p.user_id = new.seller_id;

  if not v_loyalty_on then
    return new;
  end if;

  select coalesce(sum(oi.quantity), 0)::int into v_pts
  from public.order_items oi
  join public.products pr on pr.id = oi.product_id
  where oi.order_id = new.id
    and pr.earn_loyalty_points = true;

  if v_pts <= 0 then
    return new;
  end if;

  insert into public.order_loyalty_awards (order_id, customer_id, seller_id, points_awarded)
  values (new.id, new.customer_id, new.seller_id, v_pts);

  insert into public.loyalty_balances (customer_id, seller_id, points_balance, updated_at)
  values (new.customer_id, new.seller_id, v_pts, now())
  on conflict (customer_id, seller_id) do update
  set
    points_balance = public.loyalty_balances.points_balance + v_pts,
    updated_at = now();

  if v_pts = 1 then
    v_body := 'You earned 1 loyalty point for eligible items in your delivered order. Online orders only — not walk-in POS.';
  else
    v_body := 'You earned ' || v_pts::text
      || ' loyalty points for eligible items in your delivered order. Online orders only — not walk-in POS.';
  end if;

  insert into public.notifications (recipient_id, order_id, kind, title, body, data)
  values (
    new.customer_id,
    new.id,
    'loyalty_points',
    'You earned loyalty points',
    v_body,
    jsonb_build_object('points', v_pts, 'orderId', new.id, 'app', 'customer')
  );

  return new;
end;
$$;

-- POS stock deduction. Water refills stay untracked. Ice and Others decrement.
create or replace function public.decrement_product_stock(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity < 1 then
    return;
  end if;
  update public.products
  set
    stock_quantity = greatest(0, stock_quantity - p_quantity),
    updated_at = now()
  where id = p_product_id
    and category::text in ('other', 'ice')
    and stock_quantity is not null
    and seller_id = public.seller_business_id(auth.uid());
end;
$$;

revoke all on function public.decrement_product_stock(uuid, integer) from public;
grant execute on function public.decrement_product_stock(uuid, integer) to authenticated;
grant execute on function public.decrement_product_stock(uuid, integer) to service_role;

-- Allow laundry expenses beside WRS expenses. Rows stay separated by business_unit.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'business_expenses'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%business_unit%'
  loop
    execute format('alter table public.business_expenses drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.business_expenses
  add constraint business_expenses_business_unit_check
  check (business_unit in ('wrs', 'laundry'));

create table if not exists public.user_business_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  business_id text not null check (business_id in ('wrs', 'laundry', 'owner')),
  role text not null check (role in ('owner', 'staff', 'rider')),
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.user_business_roles enable row level security;

drop policy if exists "user_business_roles read" on public.user_business_roles;
create policy "user_business_roles read"
on public.user_business_roles for select
using (
  user_id = auth.uid()
  or (
    public.is_seller(auth.uid())
    and auth.uid() = public.seller_business_id(auth.uid())
  )
);

drop policy if exists "user_business_roles owner write" on public.user_business_roles;
create policy "user_business_roles owner write"
on public.user_business_roles for all
using (
  public.is_seller(auth.uid())
  and auth.uid() = public.seller_business_id(auth.uid())
)
with check (
  public.is_seller(auth.uid())
  and auth.uid() = public.seller_business_id(auth.uid())
);

create table if not exists public.laundry_services (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  unit_label text not null default 'per load',
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laundry_services_seller_idx on public.laundry_services(seller_id, sort_order);

drop trigger if exists laundry_services_set_updated_at on public.laundry_services;
create trigger laundry_services_set_updated_at
before update on public.laundry_services
for each row execute function public.set_updated_at();

create table if not exists public.laundry_bookings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  customer_name text not null,
  contact_number text not null,
  address text,
  service_summary text not null,
  scheduled_for timestamptz not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled')),
  source text not null default 'website' check (source in ('website', 'walk_in')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laundry_bookings_seller_idx on public.laundry_bookings(seller_id, created_at desc);

drop trigger if exists laundry_bookings_set_updated_at on public.laundry_bookings;
create trigger laundry_bookings_set_updated_at
before update on public.laundry_bookings
for each row execute function public.set_updated_at();

create table if not exists public.laundry_booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.laundry_bookings(id) on delete cascade,
  service_id uuid references public.laundry_services(id) on delete set null,
  service_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.laundry_sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  booking_id uuid references public.laundry_bookings(id) on delete set null,
  customer_name text,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'gcash')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists laundry_sales_seller_idx on public.laundry_sales(seller_id, created_at desc);

create table if not exists public.laundry_sale_items (
  id uuid primary key default gen_random_uuid(),
  laundry_sale_id uuid not null references public.laundry_sales(id) on delete cascade,
  service_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.laundry_services enable row level security;
alter table public.laundry_bookings enable row level security;
alter table public.laundry_booking_items enable row level security;
alter table public.laundry_sales enable row level security;
alter table public.laundry_sale_items enable row level security;

drop policy if exists "laundry_services public read available" on public.laundry_services;
create policy "laundry_services public read available"
on public.laundry_services for select
using (is_available = true);

drop policy if exists "laundry_services seller manage" on public.laundry_services;
create policy "laundry_services seller manage"
on public.laundry_services for all
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

drop policy if exists "laundry_bookings seller manage" on public.laundry_bookings;
create policy "laundry_bookings seller manage"
on public.laundry_bookings for all
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

drop policy if exists "laundry_booking_items seller manage" on public.laundry_booking_items;
create policy "laundry_booking_items seller manage"
on public.laundry_booking_items for all
using (
  exists (
    select 1 from public.laundry_bookings b
    where b.id = booking_id
      and b.seller_id = public.seller_business_id(auth.uid())
      and public.is_seller(auth.uid())
  )
)
with check (
  exists (
    select 1 from public.laundry_bookings b
    where b.id = booking_id
      and b.seller_id = public.seller_business_id(auth.uid())
      and public.is_seller(auth.uid())
  )
);

drop policy if exists "laundry_sales seller manage" on public.laundry_sales;
create policy "laundry_sales seller manage"
on public.laundry_sales for all
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

drop policy if exists "laundry_sale_items seller manage" on public.laundry_sale_items;
create policy "laundry_sale_items seller manage"
on public.laundry_sale_items for all
using (
  exists (
    select 1 from public.laundry_sales s
    where s.id = laundry_sale_id
      and s.seller_id = public.seller_business_id(auth.uid())
      and public.is_seller(auth.uid())
  )
)
with check (
  exists (
    select 1 from public.laundry_sales s
    where s.id = laundry_sale_id
      and s.seller_id = public.seller_business_id(auth.uid())
      and public.is_seller(auth.uid())
  )
);

create or replace function public.create_public_ice_order(
  p_customer_name text,
  p_contact_number text,
  p_delivery_address text,
  p_landmark text,
  p_notes text,
  p_items jsonb
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
  v_address text := trim(coalesce(p_delivery_address, ''));
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_product record;
  v_count int := 0;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Enter the customer name.';
  end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'Enter a contact number.';
  end if;
  if char_length(v_address) < 4 then
    raise exception 'Enter the delivery address.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Choose at least one ice product.';
  end if;

  select o.user_id into v_owner
  from public.profiles o
  where o.role = 'seller'
    and coalesce(o.seller_team_role, 'owner') = 'owner'
    and coalesce(o.seller_join_status, 'approved') = 'approved'
  order by o.created_at asc
  limit 1;

  if v_owner is null then
    raise exception 'The store is not ready to take ice orders yet.';
  end if;

  insert into public.orders (
    customer_id,
    seller_id,
    customer_name,
    delivery_address,
    landmark,
    contact_number,
    notes,
    status,
    payment_method,
    order_source
  )
  values (
    null,
    v_owner,
    v_name,
    v_address,
    nullif(trim(coalesce(p_landmark, '')), ''),
    v_phone,
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending',
    'cod',
    'website'
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Each ice item must have a quantity from 1 to 50.';
    end if;

    select id, name, price, stock_quantity
    into v_product
    from public.products
    where id = v_product_id
      and seller_id = v_owner
      and category::text = 'ice'
      and is_available = true
    for update;

    if not found then
      raise exception 'An ice product is no longer available.';
    end if;
    if v_product.stock_quantity is null or v_product.stock_quantity < v_qty then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);

    update public.products
    set stock_quantity = stock_quantity - v_qty, updated_at = now()
    where id = v_product.id;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Choose at least one ice product.';
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id);
end;
$$;

revoke all on function public.create_public_ice_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.create_public_ice_order(text, text, text, text, text, jsonb) to anon;
grant execute on function public.create_public_ice_order(text, text, text, text, text, jsonb) to authenticated;

create or replace function public.create_public_laundry_booking(
  p_customer_name text,
  p_contact_number text,
  p_address text,
  p_scheduled_for timestamptz,
  p_notes text,
  p_items jsonb
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
    seller_id, customer_name, contact_number, address, service_summary, scheduled_for, notes, status, source
  )
  values (
    v_owner,
    v_name,
    v_phone,
    nullif(trim(coalesce(p_address, '')), ''),
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

revoke all on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb) to anon;
grant execute on function public.create_public_laundry_booking(text, text, text, timestamptz, text, jsonb) to authenticated;
