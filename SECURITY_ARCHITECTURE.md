# Security Architecture

## Trust Model

The browser never credits money directly. Financial authority is handled by the Render backend using Firebase Admin SDK.

Server-owned operations:

- Reward session creation.
- Reward claiming.
- Withdrawal request creation.
- Withdrawal review.
- TimeWall postback credit/reversal.
- VAST proxy validation.
- Admin claim changes.

## Firebase Spark Compatibility

The system uses:

- Firebase Hosting.
- Firebase Authentication.
- Firestore.
- Render Backend for privileged Admin SDK writes.

No Firebase Blaze or Firebase privileged server layer is required.

## Admin Security

Admin access uses Firebase Custom Claims:

- `admin: true`
- `moderator: true`

Frontend admin pages still check token claims. Backend admin routes verify Firebase ID tokens with Admin SDK and reject users without the required claims.

## Reward Protection

The backend prevents:

- Duplicate reward claims.
- Fake timers.
- Inactive tab farming.
- Multiple active sessions.
- Multi-tab abuse.
- Session replay.
- Ad/session mismatch.
- Cooldown bypass.

Firestore collections:

- `rewardSessions`
- `rewardClaims`
- `activeRewards`
- `tabLocks`
- `cooldowns`
- `adAnalytics`
- `securityIncidents`
- `logs`

## TimeWall Protection

The backend validates:

- TimeWall IP whitelist.
- SHA256 hash.
- Duplicate `transactionID`.
- Replay mismatch.
- Negative chargebacks.

## VAST Protection

The backend blocks:

- non-HTTPS URLs
- private/internal hosts
- unlisted domains
- oversized XML
- invalid VAST XML

Successful VAST XML is cached briefly to reduce Render and provider load.

