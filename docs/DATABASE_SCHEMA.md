# Database

Fresh WaterMarket database:

1. `supabase/migrations/0001_wrs_baseline.sql`
2. `supabase/migrations/0002_ice_category.sql`
3. `supabase/migrations/0003_laundry_and_public_orders.sql`

Run each file separately. Step 3 must run only after step 2 has finished.

Ice uses `products.category = ice` and the existing `orders` table. There is no second ice inventory table.

Laundry uses `laundry_services`, `laundry_bookings`, `laundry_booking_items`, `laundry_sales`, and `laundry_sale_items`. Laundry expenses use `business_expenses.business_unit = laundry`.

`user_business_roles` grants laundry or owner access in addition to the existing seller owner and staff roles. The seller role name is unchanged.

`manual/delete-all-orders.sql` deletes online orders and is not part of setup.
