-- Ice-only online orders (app / website) count as paid when marked delivered.

create or replace function public.order_is_ice_only(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
      select 1 from public.order_items oi where oi.order_id = p_order_id
    )
    and not exists (
      select 1
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
        and coalesce(p.category, 'water') <> 'ice'
    );
$$;

create or replace function public.orders_auto_settle_ice_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status is distinct from old.status
     and new.status = 'delivered'
     and coalesce(new.payment_settled, false) = false
     and coalesce(new.order_source, '') <> 'pos'
     and public.order_is_ice_only(new.id) then
    new.payment_settled := true;
    new.payment_settled_at := coalesce(new.payment_settled_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_auto_settle_ice_on_delivered on public.orders;
create trigger orders_auto_settle_ice_on_delivered
before update of status on public.orders
for each row
execute function public.orders_auto_settle_ice_on_delivered();

-- Backfill delivered ice-only online orders that are still unpaid.
update public.orders o
set payment_settled = true,
    payment_settled_at = coalesce(o.payment_settled_at, o.updated_at, now())
where o.status = 'delivered'
  and coalesce(o.payment_settled, false) = false
  and coalesce(o.order_source, '') <> 'pos'
  and public.order_is_ice_only(o.id);