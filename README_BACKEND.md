# Render Backend

This backend owns the privileged server-side operations and keeps the project compatible with Firebase Spark.

## Stack

- Node.js 20
- Express.js
- Firebase Admin SDK
- Firestore transactions
- Render Web Service

## Main Endpoints

- `GET /health`
- `GET /healthz`
- `GET /timewall/postback`
- `POST /rewards/start-session`
- `POST /rewards/claim`
- `POST /withdrawals/request`
- `POST /withdrawals/review`
- `GET /vast/proxy?url=`
- `POST /admin/set-claims`

## Local Run

```powershell
cd backend
npm install
copy .env.example .env
npm run dev
```

Deployment helpers:

- Root `render.yaml` configures the Render Web Service.
- Root `production.env.example` lists production placeholders.
- `DEPLOYMENT_CHECKLIST.md` contains the launch checklist.
- Render starts from `backend/src/server.js`.

The frontend backend URL is configured in:

```text
js/config.js
```

For local testing set:

```js
window.ADPLATFORM_BACKEND_URL = 'http://localhost:8080';
```

## Production Notes

The backend uses Firebase Admin SDK, so Firestore rules do not block trusted server writes. User-facing Firestore reads and admin Ads CRUD still use Firebase client SDK to reduce Render and Firestore cost.

