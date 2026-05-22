# Firebase Setup

This project uses Firebase Spark only:

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore

Privileged server operations run on Render Backend using Firebase Admin SDK.

## Firebase Authentication

Enable:

- Email/Password sign-in.

## Firestore

Deploy rules and indexes:

```powershell
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes --project adplatform-4d5a0
```

Financial collections are protected from client writes:

- `rewardSessions`
- `rewardClaims`
- `transactions`
- `pendingRewards`
- `withdrawals`
- sensitive user balance fields

The Render backend bypasses rules safely with Admin SDK.

## Hosting

Deploy static frontend:

```powershell
npx.cmd firebase-tools deploy --only hosting --project adplatform-4d5a0
```

## Service Account For Render

Create a Firebase service account JSON from:

Firebase Console -> Project Settings -> Service accounts.

Encode it and store in Render as:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

See `RENDER_DEPLOY_GUIDE.md`.
