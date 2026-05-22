# Admin Guide

## Access

Admin access requires Firebase Custom Claims. Firestore `role` is shown in the UI only and is not trusted for permissions.

To bootstrap the first admin claim from the local tooling:

```powershell
$env:NODE_PATH='C:\tmp\firebase-tools-probe\node_modules'
$env:SEED_ADMIN_EMAIL='admin@platform.com'
node tools\firebase-admin-tasks.js set-admin-claims
```

After the first admin is claimed, admins can use the REST endpoint `/admin/set-claims` for future role changes.

## Ads

Supported ad types:

- HTML
- Script
- iframe
- VAST
- Direct Link
- AdSense Block

VAST ads accept a VAST XML URL or full XML. If direct browser fetch fails because of CORS, the player falls back to `vastProxy`.

## Withdrawals

Supported methods:

- Vodafone Cash
- Orange Cash
- Etisalat Cash
- WE Pay / WE Cash
- InstaPay

Requests are created through the Render backend endpoint `/withdrawals/request`. Admin review uses `/withdrawals/review`; rejected requests refund the balance automatically.

## Errors Dashboard

Open:

```text
admin/errors.html
```

It reads `securityIncidents` on demand, with optional type filters and no realtime listener.

## Export / Backup

Open:

```text
admin/exports.html
```

Exports are on-demand JSON/CSV for users, ads, withdrawals, analytics, reward claims, transactions, and security incidents.

