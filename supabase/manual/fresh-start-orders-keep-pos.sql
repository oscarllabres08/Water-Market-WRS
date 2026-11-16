-- Fresh start: wipe orders, bookings, deliveries, AND all POS / laundry sales history.
-- KEEPS: products, laundry_services, inventory, seller_pos_customers, staff, expenses, accounts.
--
-- Run once in Supabase → SQL Editor (owner). IRREVERSIBLE.
-- Typical use: handover, demo reset, empty Sales / Delivery / Orders / rider app lists.

begin;

-- Seller + rider alerts tied to orders or deliveries (orphans after delete).
delete from public.notifications
where order_id is not null
   or kind in (
     'new_order',
     'order_status',
     'order_activity',
     'pending_order_reminder',
     'seller_reminder',
     'loyalty_points',
     'laundry_booking',
     'test_notification'
   )
   or (data ? 'bookingId')
   or (data ? 'orderId');

-- Website / phone laundry bookings (not laundry_sales POS walk-ins).
-- Cascades: laundry_booking_items, delivery_jobs (laundry), status history.
delete from public.laundry_bookings;

-- All online + app + delivery-linked water/ice orders (any status).
-- Cascades: order_items, order_loyalty_awards, delivery_jobs (order), etc.
delete from public.orders;

-- Safety: any stray open delivery jobs (should be empty after above).
delete from public.delivery_jobs;

-- Loyalty + container tracking from past orders / POS (same scope as owner_clear_store_sales_history).
delete from public.loyalty_vouchers;
delete from public.loyalty_balances;
delete from public.order_loyalty_awards;

delete from public.seller_customer_container_balance;
delete from public.seller_container_movements;
delete from public.seller_pos_container_movements;
delete from public.seller_pos_container_balance;

-- POS water/ice + laundry register sales (cascades pos_sale_items, laundry_sale_items).
delete from public.pos_sales;
delete from public.laundry_sales;

commit;

-- After run: Sales, Delivery, Orders, and rider queues should be empty.
-- Products, inventory, expenses, POS customer directory, and logins unchanged.