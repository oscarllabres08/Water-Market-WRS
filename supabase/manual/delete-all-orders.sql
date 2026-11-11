-- One-time wipe before client handover.
-- Run the whole file once in Supabase → SQL Editor.
--
-- Deletes every online order. These go with each order automatically:
--   order_items, order_loyalty_awards, notifications that point at an order.
-- Container movement rows stay, but their order link is cleared.
--
-- Not deleted: products, inventory, customers, staff, POS sales, expenses, accounts.

begin;

-- Test alerts and other order notices that have no order row.
delete from public.notifications
where order_id is null
  and kind in (
    'test_notification',
    'new_order',
    'order_status',
    'order_activity',
    'pending_order_reminder',
    'seller_reminder',
    'loyalty_points'
  );

delete from public.orders;

commit;
