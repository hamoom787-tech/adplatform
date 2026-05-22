# Mini Ad Platform Engine

Ù…Ù†ØµØ© Ø¥Ø¹Ù„Ø§Ù†Ø§Øª ÙˆÙ…ÙƒØ§ÙØ¢Øª Ù…Ø¨Ù†ÙŠØ© Ø¨Ù€ HTML/CSS/Vanilla JavaScript Ù…Ø¹ Ø·Ø¨Ù‚Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø­Ø¯ÙŠØ«Ø© ØªØ¹ØªÙ…Ø¯ Ø¹Ù„Ù‰ Firebase Authentication Ùˆ Cloud Firestore.

## Ø§Ù„Ù…Ø¹Ù…Ø§Ø±ÙŠØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ©

ØªÙ… ÙØµÙ„ Ù…Ù†Ø·Ù‚ Ø§Ù„Ù†Ø¸Ø§Ù… Ø¹Ù† ØµÙØ­Ø§Øª HTML Ø¯Ø§Ø®Ù„ Ø·Ø¨Ù‚Ø§Øª Services:

- `js/firebase.js`: ØªÙ‡ÙŠØ¦Ø© Firebase ÙˆØªØµØ¯ÙŠØ± Auth/Firestore instances.
- `js/auth-service.js`: Ø§Ù„ØªØ³Ø¬ÙŠÙ„ØŒ Ø§Ù„Ø¯Ø®ÙˆÙ„ØŒ Ø§Ù„Ø®Ø±ÙˆØ¬ØŒ Ø­ÙØ¸ Ø§Ù„Ø¬Ù„Ø³Ø©ØŒ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ§ØªØŒ ÙˆØ­Ù…Ø§ÙŠØ© Ø§Ù„Ù…Ø³Ø§Ø±Ø§Øª.
- `js/firestore-service.js`: CRUD Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª ÙˆØ§Ù„Ø³Ø­ÙˆØ¨Ø§Øª ÙˆØ§Ù„ØªØ­Ù„ÙŠÙ„Ø§Øª ÙˆØ§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§ØªØŒ Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ rewards/cooldowns/realtime sync.
- `js/storage.js`: ÙˆØ§Ø¬Ù‡Ø© ØªÙˆØ§ÙÙ‚ Ù„Ù„ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø¯ÙŠÙ…ØŒ Ù„ÙƒÙ†Ù‡Ø§ Ù„Ø§ ØªØ­ÙØ¸ Ø§Ù„Ù†Ø¸Ø§Ù… ÙÙŠ `localStorage` Ø¨Ø¹Ø¯ Ø§Ù„Ù‡Ø¬Ø±Ø©ØŒ Ø¨Ù„ ØªÙ…Ø±Ø± Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø¥Ù„Ù‰ `FirestoreService`.
- `js/security.js`: tab lockingØŒ reward sessionsØŒ cooldown checksØŒ visibility/focus/activity trackingØŒ ÙˆØ³Ø¬Ù„ Ø§Ù„Ø­ÙˆØ§Ø¯Ø« Ø§Ù„Ø£Ù…Ù†ÙŠØ©.
- `js/ad-engine.js`: Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø¯Ø§Ø®Ù„ Sandbox iframe ÙˆØ­Ù…Ø§ÙŠØ© Ø§Ù„ØµÙØ­Ø© Ù…Ù† Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ù…Ø¹Ø·ÙˆØ¨Ø©.
- `js/ads.js`, `js/dashboard.js`, `js/admin.js`: Ø·Ø¨Ù‚Ø© UI ÙÙ‚Ø· ÙˆØªØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ø§Ù„Ù†Ø¸Ø§Ù… Ø¹Ø¨Ø± Services.

## Ù…Ù„ÙØ§Øª Firebase

- `firestore.rules`: Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø£Ù…Ø§Ù† Ø§Ù„Ø®Ø§ØµØ© Ø¨Ù€ Firestore.
- `firestore.indexes.json`: Ø§Ù„ÙÙ‡Ø§Ø±Ø³ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø© Ù„Ù„Ø§Ø³ØªØ¹Ù„Ø§Ù…Ø§Øª realtime/filtering.
- `firebase.json`: Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Firebase Hosting Ùˆ Firestore deploy.
- `FIREBASE_SETUP.md`: Ø®Ø·ÙˆØ§Øª Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø´Ø±ÙˆØ¹ Firebase ÙˆØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ù†ØµØ©.

## Ù…Ø§ ØªÙ… Ù†Ù‚Ù„Ù‡ Ø¥Ù„Ù‰ Firestore

- Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙˆÙ†.
- Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª.
- Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª.
- Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø³Ø­Ø¨.
- Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª.
- Ø§Ù„Ù…ÙƒØ§ÙØ¢Øª ÙˆØ³Ø¬Ù„ reward claims.
- cooldowns.
- active reward locks.
- tab locks.
- security incidents.

## Ø§Ù„ØªØ´ØºÙŠÙ„

1. Ø£Ù†Ø´Ø¦ Ù…Ø´Ø±ÙˆØ¹ Firebase ÙˆÙØ¹Ù„ Authentication Ùˆ Firestore.
2. Ø§Ù†Ø³Ø® `firebaseConfig` Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ Ø¯Ø§Ø®Ù„ `js/firebase.js`.
3. Ø§Ù†Ø´Ø± Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯ ÙˆØ§Ù„ÙÙ‡Ø§Ø±Ø³:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

4. Ø´ØºÙ„ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ Ù…Ù† static server Ø£Ùˆ Firebase Hosting.

Ù„Ù„ØªÙØ§ØµÙŠÙ„ Ø§Ù„ÙƒØ§Ù…Ù„Ø© Ø±Ø§Ø¬Ø¹ `FIREBASE_SETUP.md`.

## Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø£Ù…Ø§Ù† Ù…Ù‡Ù…Ø©

Financial operations are now server-authoritative through the Render Backend with Firebase Admin SDK. The browser can request reward sessions and withdrawals, but it cannot credit balances, approve withdrawals, write transactions, or write reward claims directly.

## Ø§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ù…Ø­Ù„ÙŠ

ÙŠÙ…ÙƒÙ† ÙØ­Øµ JavaScript Ù…Ø­Ù„ÙŠØ§ Ø¹Ø¨Ø±:

```bash
node --check js/*.js
```

ÙˆØ§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ End-to-End ÙŠØ­ØªØ§Ø¬ Firebase project ÙØ¹Ù„ÙŠ Ù…Ø¹ config Ø­Ù‚ÙŠÙ‚ÙŠ ÙˆÙ‚ÙˆØ§Ø¹Ø¯ Ù…Ù†Ø´ÙˆØ±Ø©.
# Production Finalization Notes

This build uses Firebase Hosting + Firestore on the client, and Render Backend only for sensitive operations:

- `/timewall/postback`
- `/rewards/start-session`
- `/rewards/claim`
- `/withdrawals/request`
- `/withdrawals/review`
- `/vast/proxy`
- `/admin/set-claims`

Ads CRUD remains client-side for admins through Firestore rules and Custom Claims to keep Firebase cost low. Reward crediting, withdrawals, TimeWall postbacks, and VAST proxying are server-side.

Required docs:

- `FIREBASE_SETUP.md`
- `DEPLOY_GUIDE.md`
- `TIMEWALL_INTEGRATION.md`
- `SECURITY_ARCHITECTURE.md`
- `ADMIN_GUIDE.md`

