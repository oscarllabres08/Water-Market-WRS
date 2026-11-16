-- Store phone and address for walk-in customers, and let the store admin
-- update contact details on registered customer profiles.

alter table public.seller_pos_customers
  add column if not exists phone text,
  add column if not exists address text;

drop policy if exists "seller_pos_customers seller update own" on public.seller_pos_customers;
create policy "seller_pos_customers seller update own"
  on public.seller_pos_customers for update
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  )
  with check (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
    and char_length(trim(customer_name_key)) > 0
    and char_length(trim(display_name)) > 0
  );

grant update on table public.seller_pos_customers to authenticated;

create or replace function public.admin_update_customer_contact(
  p_user_id uuid,
  p_phone text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_seller(auth.uid()) then
    raise exception 'Not allowed';
  end if;

  update public.profiles
  set
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), '')
  where user_id = p_user_id
    and role = 'customer';

  if not found then
    raise exception 'Customer not found';
  end if;
end;
$$;

revoke all on function public.admin_update_customer_contact(uuid, text, text) from public;
grant execute on function public.admin_update_customer_contact(uuid, text, text) to authenticated;
