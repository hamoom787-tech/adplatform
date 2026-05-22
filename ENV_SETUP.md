# Environment Setup

## Backend `.env`

Create:

```text
backend/.env
```

From:

```text
backend/.env.example
```

For production, copy values from:

```text
production.env.example
```

Required:

```text
FIREBASE_PROJECT_ID=adplatform-4d5a0
FIREBASE_SERVICE_ACCOUNT_BASE64=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
TIMEWALL_SECRET=replace_with_timewall_secret_from_dashboard
REWARD_SESSION_SECRET=replace_with_64_plus_character_random_secret
FRONTEND_URL=https://adplatform-4d5a0.web.app
CORS_ORIGINS=https://adplatform-4d5a0.web.app
```

Optional:

```text
TIMEWALL_IP_CHECK=true
TIMEWALL_IP_WHITELIST=51.81.120.73,142.111.248.18
VAST_ALLOWED_HOSTS=second-director.com,*.second-director.com
VAST_CACHE_TTL_SECONDS=300
VAST_TIMEOUT_MS=5000
```

## Frontend Config

Edit:

```text
js/backend-config.js
```

Production:

```js
window.ADPLATFORM_BACKEND_URL = 'https://YOUR_RENDER_SERVICE.onrender.com';
```

Local:

```js
window.ADPLATFORM_BACKEND_URL = 'http://localhost:8080';
```

Or set in browser console:

```js
localStorage.setItem('ap_backend_url', 'http://localhost:8080')
```
