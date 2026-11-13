-- Walk-in POS sales can be sent for delivery.
-- The sale stays the payment record. A separate delivery order is opened so it can be assigned to a rider.

alter table public.orders drop constraint if exists orders_order_source_check;
alter table public.orders add constraint orders_order_source_check
  check (order_source in ('app', 'website', 'pos'));

alter table public.pos_sales add column if not exists for_delivery boolean not null default false;
alter table public.pos_sales add column if not exists delivery_address text;
alter table public.pos_sales add column if not exists delivery_landmark text;
alter table public.pos_sales add column if not exists delivery_order_id uuid references public.orders(id) on delete set null;

create or replace function public.pos_open_walkin_delivery(
  p_sale_id uuid,
  p_customer_name text,
  p_address text,
  p_landmark text,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_business uuid;
  v_seller uuid;
  v_existing uuid;
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_landmark text := nullif(trim(coalesce(p_landmark, '')), '');
  v_payment text := case lower(trim(coalesce(p_payment_method, '')))
    when 'gcash' then 'gcash'
    when 'maya' then 'maya'
    when 'utang' then 'utang'
    else 'cod'
  end;
  v_order uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  v_business := public.seller_business_id(v_actor);
  if v_business is null or not public.is_seller(v_actor) then
    raise exception 'Only store staff can open a walk-in delivery.';
  end if;
  if v_name is null then
    raise exception 'Customer name is required for delivery.';
  end if;
  if v_address is null then
    raise exception 'Delivery address is required.';
  end if;

  select s.seller_id, s.delivery_order_id
  into v_seller, v_existing
  from public.pos_sales s
  where s.id = p_sale_id;
  if v_seller is null then
    raise exception 'Sale was not found.';
  end if;
  if v_seller is distinct from v_business and v_seller is distinct from v_actor then
    raise exception 'This sale belongs to another store.';
  end if;
  if v_existing is not null then
    return v_existing;
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
    order_source,
    payment_method,
    payment_settled
  ) values (
    null,
    v_seller,
    v_name,
    v_address,
    v_landmark,
    'Walk-in',
    v_landmark,
    'confirmed',
    'pos',
    v_payment,
    false
  )
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order, i.product_id, i.product_name, i.unit_price, i.quantity
  from public.pos_sale_items i
  where i.pos_sale_id = p_sale_id;

  update public.pos_sales
  set for_delivery = true,
      delivery_address = v_address,
      delivery_landmark = v_landmark,
      delivery_order_id = v_order
  where id = p_sale_id;

  return v_order;
end;
$$;

revoke all on function public.pos_open_walkin_delivery(uuid, text, text, text, text) from public;
grant execute on function public.pos_open_walkin_delivery(uuid, text, text, text, text) to authenticated;
