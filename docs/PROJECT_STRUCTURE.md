# Project structure

```text
admin-web/          Vite React TypeScript. Public site and the three portals.
customer-app/       Expo customer app. Screens stay in app/, ui/, lib/, and providers/.
rider-app/          Expo rider app. Formerly seller-app. Database role remains seller.
supabase/migrations Existing station schema, then ice and laundry.
supabase/functions  Push notification function.
supabase/manual     Destructive one-off scripts. Not for setup.
docs/               Route, schema, and app notes.
scripts/            Icons and a commit helper that will not push to Water Chaste.
```

Existing WRS pages remain in `admin-web/src/pages` so their imports stay intact. New laundry, owner, and public screens are in subfolders. The admin CSS and POS layout were not redesigned.
