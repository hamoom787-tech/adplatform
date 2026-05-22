# Production Ready Report

Date: 2026-05-22

## Deployment Status

Firebase Hosting was deployed successfully:

```text
https://adplatform-4d5a0.web.app
```

Render backend is fully prepared through `render.yaml`, `backend/src/server.js`, and `production.env.example`. The actual Render Web Service still requires Render account access and secret environment variables.

Current Render URL check:

```text
https://adplatform-backend.onrender.com/health -> 404
```

This means the Render service is not deployed yet, or the service currently available at that URL is not this backend.

## Executive Summary

The project has been migrated from Firebase privileged server execution to a Render Express backend while keeping Firebase Spark for Hosting, Auth, and Firestore.

Sensitive operations are now server-authoritative:

- Reward session creation.
- Reward claiming.
- Withdraw request creation.
- Admin withdrawal review.
- TimeWall postbacks.
- VAST proxying.
- Admin custom claims.

The frontend keeps the current UI and continues to use Firestore directly only for safe reads and admin Ads CRUD protected by Firestore rules and Firebase Custom Claims.

## New Backend Architecture

Backend folder:

- `backend/server.js`
- `backend/src/server.js`
- `backend/firebase-admin.js`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/.env.example`
- `backend/middleware/`
- `backend/routes/`
- `backend/services/`
- `backend/utils/`
- `backend/tests/`
- `js/config.js`

Deployment files:

- `render.yaml`
- `production.env.example`
- `DEPLOYMENT_CHECKLIST.md`

Documentation:

- `README_BACKEND.md`
- `RENDER_DEPLOY_GUIDE.md`
- `API_DOCUMENTATION.md`
- `ENV_SETUP.md`
- `SECURITY_ARCHITECTURE.md`
- `TIMEWALL_INTEGRATION.md`

## Final APIs

Base URL:

```text
https://YOUR_RENDER_SERVICE.onrender.com
```

Public:

- `GET /health`
- `GET /healthz`
- `GET /timewall/postback`
- `GET /vast/proxy?url=`

Authenticated:

- `POST /rewards/start-session`
- `POST /rewards/claim`
- `POST /withdrawals/request`

Admin/moderator:

- `POST /withdrawals/review`
- `POST /admin/set-claims`

## TimeWall URL

```text
https://YOUR_RENDER_SERVICE.onrender.com/timewall/postback?userID={userID}&transactionID={transactionID}&currencyAmount={currencyAmount}&revenue={revenue}&hash={hash}&type={type}&offername={offername}&ip={ip}&withdrawid={withdrawid}&reason={reason}&offerdetail={offerdetail}
```

Hash formula:

```text
sha256(userID + revenue + SecretKey)
```

The secret is not committed. Store it in Render as:

```text
TIMEWALL_SECRET
```

## Environment Variables

Required:

- `NODE_ENV=production`
- `PORT=8080`
- `FIREBASE_PROJECT_ID=adplatform-4d5a0`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FRONTEND_URL=https://adplatform-4d5a0.web.app`
- `CORS_ORIGINS=https://adplatform-4d5a0.web.app`
- `TIMEWALL_SECRET`
- `REWARD_SESSION_SECRET`

Security/performance controls:

- `TIMEWALL_IP_CHECK=true`
- `TIMEWALL_IP_WHITELIST=51.81.120.73,142.111.248.18`
- `VAST_ALLOWED_HOSTS`
- `VAST_CACHE_TTL_SECONDS=300`
- `VAST_TIMEOUT_MS=5000`
- `VAST_MAX_BYTES=1048576`
- `GENERAL_RATE_LIMIT_WINDOW_MS=60000`
- `GENERAL_RATE_LIMIT_MAX=120`
- `REWARD_RATE_LIMIT_MAX=30`
- `WITHDRAWAL_RATE_LIMIT_MAX=10`

Full placeholders are in `production.env.example`.

## Security Verification

Implemented:

- Firebase Admin SDK writes only from Render backend.
- Firebase ID token validation middleware.
- Admin/moderator middleware with Custom Claims.
- TimeWall SHA256 hash verification.
- TimeWall IP whitelist.
- Duplicate transaction prevention.
- Reward session signatures.
- Cooldown and active session validation.
- Multi-tab lock validation.
- Duplicate claim prevention.
- Withdrawal race-condition protection with Firestore transactions.
- VAST HTTPS-only validation.
- VAST private/internal host blocking.
- VAST host allowlist.
- Centralized error handling and security incident logging.

## Firestore Integration

Server-owned collections:

- `rewardSessions`
- `rewardClaims`
- `transactions`
- `pendingRewards`
- `withdrawals` financial status transitions
- `logs`
- `securityIncidents`

Client-safe collections remain guarded by Firestore rules.

`firebase.json` ignores:

```text
backend/**
```

So Firebase Hosting will not upload the Render backend.

## Export System

Admin export supports:

- users
- ads
- withdrawals
- adAnalytics
- rewardClaims
- transactions
- securityIncidents
- logs

Exports are on-demand only to reduce Firestore reads.

## Verification Results

Passed:

- JSON config validation for `firebase.json`, `firestore.indexes.json`, `backend/package.json`, and `backend/package-lock.json`.
- Backend syntax validation with `npm run check`.
- Full project JavaScript syntax validation, excluding `node_modules`: 49 files checked.
- Backend unit tests: 7 passed.
- Local health endpoint:
  - `GET /health` -> 200.
  - `GET /healthz` -> 200.
- Firebase Hosting deploy:
  - completed successfully.
  - hosting URL: `https://adplatform-4d5a0.web.app`.
- Hosted config smoke check:
  - `GET /js/config.js` returned 200 during verification.
- Auth protection smoke tests:
  - `POST /rewards/start-session` without token -> 401.
  - `POST /withdrawals/request` without token -> 401.
  - `POST /admin/set-claims` without token -> 401.
- VAST validation:
  - non-HTTPS local URL blocked -> 400.
- TimeWall invalid hash:
  - rejected -> 403.
- Codebase scan:
  - No project references to Firebase Functions remain outside `node_modules`.
  - No committed TimeWall secret remains.
  - Empty legacy `functions/` directory removed.

## Dependency Audit

`firebase-admin` was upgraded to `^13.10.0`.

`npm audit` still reports 8 moderate advisories from Google SDK transitive dependencies (`@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `uuid`, and related packages). npm suggests a major downgrade to `firebase-admin@10.3.0`, which is not recommended for this production code path.

Current decision:

- Keep current Firebase Admin SDK.
- Track upstream Google SDK dependency updates.
- Do not downgrade the Admin SDK.

## Live E2E Status

Static and local backend verification are complete.

Full live browser E2E requires:

- Render service deployed.
- Render env vars configured.
- `js/config.js` points to the deployed Render URL.
- Firebase Hosting redeployed after config changes.
- A test user and admin Custom Claim available.
- Current default backend URL returns 404 until Render is deployed.

Live E2E checklist is in `DEPLOYMENT_CHECKLIST.md`.

## Render Deployment Steps

1. Create Render Web Service from `backend/`, or use root `render.yaml`.
2. Build command: `npm install`.
3. Start command: `npm install && npm start`.
4. Health check path: `/health`.
5. Add all env vars from `production.env.example`.
6. Open `/health` and confirm `status: "ok"`.
7. Update `js/config.js` only if the Render service URL differs from `https://adplatform-backend.onrender.com`.
8. Deploy Firebase:

```bash
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project adplatform-4d5a0
```

9. Add the TimeWall postback URL above in TimeWall dashboard.

## Readiness Rating

Code readiness: Production-ready after Render env setup.

Launch blockers:

- Render backend must be deployed.
- Firebase service account must be stored as Render env var.
- Real live E2E must be executed after deployment.
- Upstream Google SDK audit advisories should be monitored.
