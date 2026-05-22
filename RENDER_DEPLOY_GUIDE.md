# Render Deploy Guide

## 1. Create Firebase Service Account

Firebase Console:

Project Settings -> Service accounts -> Generate new private key.

Do not commit this JSON file.

## 2. Encode Service Account

PowerShell:

```powershell
$json = Get-Content .\firebase-service-account.json -Raw
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
```

Copy the output into Render env var:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

## 3. Create Render Web Service

- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm install && npm start`
- Health Check Path: `/health`
- Instance: Free is acceptable for low traffic.

The root `render.yaml` can also be used as a Render Blueprint.

## 4. Required Environment Variables

```text
NODE_ENV=production
PORT=8080
FIREBASE_PROJECT_ID=adplatform-4d5a0
FIREBASE_SERVICE_ACCOUNT_BASE64=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
TIMEWALL_SECRET=replace_with_timewall_secret_from_dashboard
REWARD_SESSION_SECRET=replace_with_64_plus_character_random_secret
FRONTEND_URL=https://adplatform-4d5a0.web.app
CORS_ORIGINS=https://adplatform-4d5a0.web.app
TIMEWALL_IP_CHECK=true
TIMEWALL_IP_WHITELIST=51.81.120.73,142.111.248.18
```

The complete placeholder list is available in `production.env.example`.

## 5. Update Frontend

Edit:

```text
js/backend-config.js
```

Set:

```js
window.ADPLATFORM_BACKEND_URL = 'https://YOUR_RENDER_SERVICE.onrender.com';
```

Then deploy Firebase Hosting:

```powershell
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project adplatform-4d5a0
```

## 6. TimeWall URL

```text
https://YOUR_RENDER_SERVICE.onrender.com/timewall/postback?userID={userID}&transactionID={transactionID}&currencyAmount={currencyAmount}&revenue={revenue}&hash={hash}&type={type}&offername={offername}&ip={ip}&withdrawid={withdrawid}&reason={reason}&offerdetail={offerdetail}
```

## 7. Verify

- `GET /health` returns `{ ok: true }`.
- `GET /healthz` returns `ok`.
- Login user can call `/rewards/start-session`.
- Completed ad calls `/rewards/claim`.
- Wallet sends `/withdrawals/request`.
- Admin review sends `/withdrawals/review`.
- VAST player falls back to `/vast/proxy`.
