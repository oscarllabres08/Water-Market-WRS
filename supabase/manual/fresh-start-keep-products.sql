-- Full fresh start: orders, bookings, deliveries, sales history, AND user accounts (customers + staff/riders/admins).
-- KEEPS: products, laundry_services, inventory/stock, business_expenses, store owner login.
--
-- Run once in Supabase → SQL Editor. IRREVERSIBLE.
-- You stay signed in only as master admin(s) (seller owner). All customer & staff auth users removed.

begin;

-- ── 1) Notifications & delivery queue ─────────────────────────────────────
delete from public.notifications;

delete from public.laundry_bookings;
delete from public.orders;
delete from public.delivery_jobs;

delete from public.pos_sales;
delete from public.laundry_sales;

-- ── 2) Loyalty & per-customer store links (not POS product catalog) ─────────
delete from public.loyalty_vouchers;
delete from public.loyalty_balances;
delete from public.order_loyalty_awards;

delete from public.seller_customer_container_balance;
delete from public.seller_container_movements;
delete from public.seller_pos_container_movements;
delete from public.seller_pos_container_balance;

delete from public.seller_hidden_customers;
delete from public.seller_hidden_pos_customers;
delete from public.seller_pos_customers;

delete from public.rider_download_tickets;

-- ── 3) Staff portal roles (customers + staff rows removed below) ─────────────
delete from public.user_business_roles u
where u.user_id in (
  select p.user_id
  from public.profiles p
  where p.role = 'customer'
     or (p.role = 'seller' and coalesce(p.seller_team_role, 'owner') <> 'owner')
);

delete from public.push_tokens t
where t.user_id in (
  select p.user_id
  from public.profiles p
  where p.role = 'customer'
     or (p.role = 'seller' and coalesce(p.seller_team_role, 'owner') <> 'owner')
);

-- ── 4) Delete auth users → cascades profiles for customers & workspace staff ─
-- Keeps: seller accounts with seller_team_role = owner (master admin who owns products).
delete from auth.users u
where u.id in (
  select p.user_id
  from public.profiles p
  where p.role = 'customer'
     or (p.role = 'seller' and coalesce(p.seller_team_role, 'owner') <> 'owner')
);

commit;

-- Still there: public.products, public.laundry_services, business_expenses,
-- master admin profile(s), store settings.
-- Gone: customer app accounts, rider/admin staff, all online orders & delivery list.