# Deployment Checklist

## Render Backend

- Create a Render Web Service from `backend/`.
- Use Node 20 or newer.
- Build command: `npm install`.
- Start command: `npm install && npm start`.
- Health check path: `/health`.
- Add all variables from `production.env.example`.
- Keep `FIREBASE_SERVICE_ACCOUNT_BASE64`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `TIMEWALL_SECRET`, and `REWARD_SESSION_SECRET` as secret env vars only.
- Open `https://YOUR_RENDER_SERVICE.onrender.com/health` and verify `{ "status": "ok" }`.

## Firebase Spark

- Keep Firebase Hosting + Firestore + Auth on Spark.
- Deploy only hosting, rules, and indexes:

```bash
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project adplatform-4d5a0
```

- Confirm `firebase.json` ignores `backend/**`.

## Frontend Backend URL

- Update `js/config.js` if the Render service URL is different from the default service name:

```js
API_BASE_URL: 'https://YOUR_RENDER_SERVICE.onrender.com'
```

- Redeploy Firebase Hosting after updating the URL.

## TimeWall

Use this postback URL:

```text
https://YOUR_RENDER_SERVICE.onrender.com/timewall/postback?userID={userID}&transactionID={transactionID}&currencyAmount={currencyAmount}&revenue={revenue}&hash={hash}&type={type}&offername={offername}&ip={ip}&withdrawid={withdrawid}&reason={reason}&offerdetail={offerdetail}
```

- Hash formula must be `sha256(userID + revenue + SecretKey)`.
- Keep the TimeWall secret only in Render env vars.
- Keep IP whitelist enabled unless testing with TimeWall support.

## Launch Verification

- Register and login with a normal user.
- Verify admin access depends on Firebase Custom Claims.
- Add, preview, disable, duplicate, and delete ads.
- Watch an ad, claim reward, retry the same claim, and confirm duplicate is blocked.
- Confirm cooldown blocks fast repeat claims.
- Create a withdrawal request and review it from admin.
- Test TimeWall valid, duplicate, invalid hash, pending, hold_cancelled, and reversal callbacks.
- Test VAST direct playback and fallback proxy.
- Export users, ads, withdrawals, analytics, reward claims, security incidents, and logs.
