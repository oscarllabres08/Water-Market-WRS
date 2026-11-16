Manual scripts only. Do not run as part of normal setup.

| File | What it does |
| --- | --- |
| `delete-all-orders.sql` | Deletes every row in `orders` only (+ related notifications). Keeps POS, laundry bookings. |
| `fresh-start-orders-keep-pos.sql` | Deletes **orders**, **laundry_bookings**, **delivery_jobs**, **pos_sales**, **laundry_sales**, loyalty/container sales data, and order/delivery **notifications**. Keeps products, inventory, **seller_pos_customers**, staff, expenses, accounts. (Filename legacy: no longer keeps POS history.) |
| `fresh-start-keep-products.sql` | Everything in the row above **plus** deletes **all customer & staff/rider/admin auth accounts** and POS customer links. Keeps **products**, **laundry_services**, expenses, and **master admin (owner)** only. |
