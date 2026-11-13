-- Free refill costs 5 loyalty points, not 10.
-- Applies to app voucher redeem, store-given refills, and walk-in refills.

alter table public.loyalty_vouchers
  alter column points_spent set default 5;

create or replace function public.customer_redeem_loyalty_voucher(p_seller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
  v_code text;
  v_id uuid;
  v_exp timestamptz := now() + interval '3 days';
  v_attempt int;
  v_loyalty_on boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_uid and p.role = 'customer') then
    raise exception 'Only customers can redeem loyalty rewards';
  end if;

  select coalesce(p.loyalty_points_active, false) into v_loyalty_on
  from public.profiles p
  where p.user_id = p_seller_id;

  if not v_loyalty_on then
    return jsonb_build_object('ok', false, 'error', 'loyalty_inactive');
  end if;

  update public.loyalty_balances lb
  set
    points_balance = lb.points_balance - 5,
    updated_at = now()
  where lb.customer_id = v_uid
    and lb.seller_id = p_seller_id
    and lb.points_balance >= 5;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;

  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 8 then
      update public.loyalty_balances lb
      set points_balance = lb.points_balance + 5, updated_at = now()
      where lb.customer_id = v_uid and lb.seller_id = p_seller_id;
      raise exception 'Could not generate a unique voucher code';
    end if;
    v_code := 'REF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    begin
      insert into public.loyalty_vouchers (
        customer_id,
        seller_id,
        code,
        status,
        points_spent,
        expires_at
      )
      values (
        v_uid,
        p_seller_id,
        v_code,
        'active',
        5,
        v_exp
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'voucher_id', v_id,
    'code', v_code,
    'expires_at', v_exp,
    'note', 'Show this code at the store for 1 free container refill. Valid for 3 days — redeem only when you are ready to refill.'
  );
end;
$$;

revoke all on function public.customer_redeem_loyalty_voucher(uuid) from public;
grant execute on function public.customer_redeem_loyalty_voucher(uuid) to authenticated;
grant execute on function public.customer_redeem_loyalty_voucher(uuid) to service_role;

create or replace function public.seller_give_free_refill(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business uuid := public.seller_business_id(auth.uid());
  v_left int;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_seller(auth.uid()) or v_business is null then
    return jsonb_build_object('ok', false, 'error', 'not_seller', 'message', 'Only the store can give a free refill.');
  end if;
  if p_customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_customer', 'message', 'Choose a customer.');
  end if;

  update public.loyalty_balances lb
  set
    points_balance = lb.points_balance - 5,
    updated_at = now()
  where lb.customer_id = p_customer_id
    and lb.seller_id = v_business
    and lb.points_balance >= 5
  returning lb.points_balance into v_left;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_points',
      'message', 'This customer does not have 5 points yet.'
    );
  end if;

  select coalesce(nullif(trim(p.display_name), ''), 'Customer') into v_name
  from public.profiles p
  where p.user_id = p_customer_id;

  begin
    insert into public.notifications (recipient_id, order_id, kind, title, body, data)
    values (
      p_customer_id,
      null,
      'loyalty_points',
      'Free refill given',
      'The store gave you 1 free refill. 5 loyalty points were used.'
        || case when v_left > 0 then ' You have ' || v_left::text || ' points left.' else ' Your points are back to 0.' end,
      jsonb_build_object('points_remaining', v_left, 'free_refill', true, 'app', 'customer')
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'points_remaining', v_left,
    'customer_name', v_name
  );
end;
$$;

revoke all on function public.seller_give_free_refill(uuid) from public;
grant execute on function public.seller_give_free_refill(uuid) to authenticated;
grant execute on function public.seller_give_free_refill(uuid) to service_role;

create or replace function public.seller_give_walkin_free_refill(p_customer_name_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business uuid := public.seller_business_id(auth.uid());
  v_key text := nullif(lower(regexp_replace(trim(coalesce(p_customer_name_key, '')), '\s+', ' ', 'g')), '');
  v_left int;
  v_name text;
begin
  if auth.uid() is null or not public.is_seller(auth.uid()) or v_business is null then
    return jsonb_build_object('ok', false, 'error', 'not_seller', 'message', 'Only the store can give a free refill.');
  end if;
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'missing_customer', 'message', 'Choose a customer.');
  end if;

  update public.pos_loyalty_balances b
  set
    points_balance = b.points_balance - 5,
    updated_at = now()
  where b.seller_id = v_business
    and b.customer_name_key = v_key
    and b.points_balance >= 5
  returning b.points_balance, b.display_name into v_left, v_name;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_points',
      'message', 'This customer does not have 5 points yet.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'points_remaining', v_left,
    'customer_name', v_name
  );
end;
$$;

revoke all on function public.seller_give_walkin_free_refill(text) from public;
grant execute on function public.seller_give_walkin_free_refill(text) to authenticated;
grant execute on function public.seller_give_walkin_free_refill(text) to service_role;
