-- Notify the assigned rider when admin assigns a delivery job.

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
  v_code text;
  v_body text;
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

  v_code := case
    when p_source_kind = 'laundry' then 'LY-' || upper(substr(replace(p_source_id::text, '-', ''), 1, 6))
    else 'WM-' || upper(substr(replace(p_source_id::text, '-', ''), 1, 6))
  end;

  v_body := coalesce(nullif(trim(v_customer), ''), 'Customer')
    || ' — ' || v_code || '. Assigned to you for delivery.';
  if coalesce(v_items, '') <> '' then
    v_body := v_body || ' ' || v_items;
  end if;

  insert into public.notifications(recipient_id, order_id, kind, title, body, data)
  values (
    p_rider_id,
    case when p_source_kind = 'order' then p_source_id else null end,
    'delivery_assigned',
    'Delivery assigned',
    v_body,
    jsonb_build_object(
      'kind', 'delivery_assigned',
      'app', 'seller',
      'jobId', v_job.id,
      'orderId', v_job.order_id,
      'laundryBookingId', v_job.laundry_booking_id,
      'sourceKind', p_source_kind,
      'customerName', coalesce(v_customer, ''),
      'deliveryCode', v_code
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'rider_id', v_job.rider_id,
    'status', v_job.status,
    'assigned_at', v_job.assigned_at
  );
end;
$$;