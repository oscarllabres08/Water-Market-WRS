-- Save the customer's pin on a website ice order so staff can open the route.

drop function if exists public.create_public_ice_order(text, text, text, text, text, jsonb);

create or replace function public.create_public_ice_order(
  p_customer_name text,
  p_contact_number text,
  p_delivery_address text,
  p_landmark text,
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
    raise exception 'The store is not ready to take ice orders yet.';
  end if;

  insert into public.orders (
    customer_id,
    seller_id,
    customer_name,
    delivery_address,
    landmark,
    contact_number,
    latitude,
    longitude,
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
    p_latitude,
    p_longitude,
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

revoke all on function public.create_public_ice_order(text, text, text, text, text, jsonb, double precision, double precision) from public;
grant execute on function public.create_public_ice_order(text, text, text, text, text, jsonb, double precision, double precision) to anon;
grant execute on function public.create_public_ice_order(text, text, text, text, text, jsonb, double precision, double precision) to authenticated;
