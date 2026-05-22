# Deploy Guide

This project now uses Firebase Spark plus Render Backend.

## Firebase Deploy

Firebase hosts the static frontend, Firestore rules, and indexes.

```powershell
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project adplatform-4d5a0
```

## Render Deploy

Deploy `backend/` as a Render Web Service.

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node.js 20+

Required Render env vars are documented in:

```text
ENV_SETUP.md
RENDER_DEPLOY_GUIDE.md
```

## Frontend Backend URL

After Render creates the service URL, edit:

```text
js/backend-config.js
```

Set:

```js
window.ADPLATFORM_BACKEND_URL = 'https://YOUR_RENDER_SERVICE.onrender.com';
```

Then deploy Firebase Hosting.

## Admin Claims

Bootstrap the first admin claim using the existing tool:

```powershell
$env:NODE_PATH='C:\tmp\firebase-tools-probe\node_modules'
$env:SEED_ADMIN_EMAIL='admin@platform.com'
node tools\firebase-admin-tasks.js set-admin-claims
```

## Smoke Test

1. Open `https://YOUR_RENDER_SERVICE.onrender.com/health`.
2. Open frontend.
3. Login.
4. Start an ad watch.
5. Complete reward claim.
6. Submit withdrawal.
7. Review withdrawal from admin.
8. Add VAST ad and confirm proxy fallback works.
