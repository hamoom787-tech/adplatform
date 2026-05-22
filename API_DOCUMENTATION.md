# API Documentation

Base URL:

```text
https://YOUR_RENDER_SERVICE.onrender.com
```

Authenticated endpoints require:

```http
Authorization: Bearer <Firebase ID Token>
```

## Health

```http
GET /health
```

```http
GET /healthz
```

## TimeWall Postback

```http
GET /timewall/postback
```

Query params:

- `userID`
- `transactionID`
- `currencyAmount`
- `revenue`
- `hash`
- `type`
- `offername`
- `ip`
- `withdrawid`
- `reason`
- `offerdetail`

Supported `type`:

- `credit`
- `reversal`
- `refund`
- `pending`
- `hold_cancelled`

Hash:

```text
SHA256(userID + revenue + TIMEWALL_SECRET)
```

Success returns HTTP `200 OK` with `OK` or `DUPLICATE_OK`.

## Start Reward Session

```http
POST /rewards/start-session
```

Body:

```json
{
  "adId": "ad-id",
  "fingerprintHash": "client-fingerprint",
  "tabId": "tab-id"
}
```

## Claim Reward

```http
POST /rewards/claim
```

Body:

```json
{
  "sessionId": "reward-session-id",
  "adId": "ad-id",
  "elapsedSeconds": 20,
  "fingerprint": "client-fingerprint",
  "visibilityStats": {
    "hiddenEvents": 0,
    "focusEvents": 0,
    "pauseMs": 0
  }
}
```

## Request Withdrawal

```http
POST /withdrawals/request
```

Body:

```json
{
  "amount": 50,
  "methodKey": "vodafone_cash",
  "account": "01000000000"
}
```

Supported `methodKey`:

- `vodafone_cash`
- `orange_cash`
- `etisalat_cash`
- `we_cash`
- `instapay`

## Review Withdrawal

Admin/moderator only:

```http
POST /withdrawals/review
```

Body:

```json
{
  "withdrawalId": "withdrawal-id",
  "status": "approved",
  "note": "optional"
}
```

## VAST Proxy

```http
GET /vast/proxy?url=https%3A%2F%2Fexample.com%2Fvast.xml
```

Only HTTPS and allowlisted hosts are accepted.

## Admin Claims

Admin only:

```http
POST /admin/set-claims
```

Body:

```json
{
  "uid": "firebase-auth-uid",
  "admin": true,
  "moderator": true
}
```
