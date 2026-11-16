-- Notify laundry seller when a booking row is created (website or POS).

create or replace function public.notify_laundry_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_body text;
begin
  v_body := trim(coalesce(new.customer_name, 'Customer'));
  if new.scheduled_for is not null then
    v_body := v_body || ' · Pickup ' || to_char(new.scheduled_for at time zone 'Asia/Manila', 'Mon DD, HH12:MI AM');
  end if;
  if coalesce(new.service_summary, '') <> '' and new.service_summary <> 'Pending' then
    v_body := v_body || ' · ' || new.service_summary;
  end if;

  insert into public.notifications (recipient_id, order_id, kind, title, body, data)
  values (
    new.seller_id,
    null,
    'laundry_booking',
    'New laundry booking',
    v_body,
    jsonb_build_object(
      'bookingId', new.id,
      'source', new.source,
      'app', 'seller',
      'kind', 'laundry_booking'
    )
  );

  return new;
exception
  when others then
    raise warning 'notify_laundry_booking_insert skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists laundry_booking_notify_seller on public.laundry_bookings;
create trigger laundry_booking_notify_seller
after insert on public.laundry_bookings
for each row
execute function public.notify_laundry_booking_insert();