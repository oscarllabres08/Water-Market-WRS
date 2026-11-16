# Website APK downloads (included in deploy)

After each mobile build, copy APKs here so they ship with **admin-web** (Vite `public/` → `dist/downloads/`).

```powershell
.\scripts\publish-download-apks.ps1 `
  -CustomerApk "C:\path\to\customer.apk" `
  -RiderApk "C:\path\to\rider.apk"
```

Then commit and deploy:

```powershell
git add admin-web/public/downloads/*.apk
git commit -m "Update customer and rider APKs for download site"
git push
```

**File names (required):**

- `customer-app.apk` — public on `/water-refilling`
- `rider-app.apk` — not a public link. `/downloads/rider-app.apk` and `/download/rider-app.apk` redirect to the water page unless the visitor just entered the download PIN. Apply migration `0018_rider_download_ticket.sql` before relying on this.

Each file should be **tens of MB** (not KB). If download is ~3 KB or Android says *problem parsing the package*, the host served HTML instead of the APK — redeploy after APKs are in this folder.

Optional override without replacing files: `VITE_CUSTOMER_APK_URL` / `VITE_RIDER_APK_URL` in hosting env.