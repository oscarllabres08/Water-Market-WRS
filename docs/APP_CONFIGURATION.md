# App configuration

Environment files were not changed:

- `admin-web/.env.local` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `customer-app/.env` and `rider-app/.env` use `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`

| App | Name | Slug | Android package | iOS bundle | Scheme |
| --- | --- | --- | --- | --- | --- |
| Customer | WaterMarket Customer | watermarket-customer | com.watermarket.customer | com.watermarket.customer | watermarketcustomer |
| Rider | WaterMarket Rider | watermarket-rider | com.watermarket.rider | com.watermarket.rider | watermarketrider |

EAS project IDs are not set. In each app folder, after `npm install`, run `eas init` and choose a new project. Do not reuse the Water Chaste project.

`google-services.json` is still the previous Firebase project. Replace both files, and the iOS `GoogleService-Info.plist` placeholders, after the WaterMarket Firebase apps exist. The Android package in Firebase must match the package above or the new APK will not receive push notifications.

Customer usernames are stored as `username@customer.watermarket.ph`. Accounts created earlier with `@customer.waterchaste.app` still show their username, but a new sign-in uses the WaterMarket domain.
