# WaterMarket

Water refilling, ice, and laundry on one WaterMarket project. The water station screens, customer app, and rider app keep their existing layout.

## Apps

| Folder | What it is |
| --- | --- |
| `admin-web/` | Public website plus WRS, laundry, and owner portals |
| `customer-app/` | WaterMarket Customer (Expo) |
| `rider-app/` | WaterMarket Rider (Expo). The database role is still `seller`. |
| `supabase/` | SQL migrations and the push function |

## Website paths

- `/` public home
- `/water-refilling` customer app download, and the rider app behind the store PIN
- `/ice-cubes` ice catalog and delivery order
- `/laundry` laundry booking
- `/wrs-management` water and ice back office
- `/laundry-management` laundry back office
- `/overall-sales` owner totals

Sign-in URLs are `/wrs-management/login`, `/laundry-management/login`, and `/overall-sales/login`.

## Database

Run `supabase/README.md`. Do not run `supabase/manual/delete-all-orders.sql` during setup.

The live environment files already point at the WaterMarket Supabase project. Do not replace them.

## Mobile builds

Package names are `com.watermarket.customer` and `com.watermarket.rider`. EAS project IDs were removed so these apps do not attach to Water Chaste. Create new Expo projects with `eas init` in each app folder. Replace `google-services.json` after the WaterMarket Firebase project exists. Until then, push notifications still point at the previous Firebase project.

APK files for the website are in `admin-web/public/downloads/`.

## GitHub

`origin` is still the Water Chaste repository. Point it at a new WaterMarket repository before pushing. `scripts/push-monorepo.ps1` refuses to continue while origin still contains Water-Chaste.
