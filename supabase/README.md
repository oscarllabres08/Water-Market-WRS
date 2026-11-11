# WaterMarket database

Run these files in the Supabase SQL Editor, in order, each as its own execution.

1. `migrations/0001_wrs_baseline.sql` — existing water refilling schema. Run once on a fresh WaterMarket database. Skip it if this project already has the water station tables.
2. `migrations/0002_ice_category.sql` — adds the `ice` value to `product_category`.
3. `migrations/0003_laundry_and_public_orders.sql` — laundry tables, guest ice orders, and ice stock. Run only after step 2 has finished.

`manual/delete-all-orders.sql` deletes online orders. It is not part of setup. Do not run it unless you mean to wipe orders.

`functions/push-notify` is the push notification Edge Function. Deploy it to the WaterMarket Supabase project after you create the WaterMarket Firebase project.
