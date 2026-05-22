# TimeWall Integration

Use the Render backend postback URL:

```text
https://YOUR_RENDER_SERVICE.onrender.com/timewall/postback?userID={userID}&transactionID={transactionID}&currencyAmount={currencyAmount}&revenue={revenue}&hash={hash}&type={type}&offername={offername}&ip={ip}&withdrawid={withdrawid}&reason={reason}&offerdetail={offerdetail}
```

Replace `YOUR_RENDER_SERVICE` with the Render service URL.

## Security

Allowed TimeWall IPs:

```text
51.81.120.73
142.111.248.18
```

Hash formula:

```text
SHA256(userID + revenue + TIMEWALL_SECRET)
```

Secret:

```text
Use the secret shown in your TimeWall dashboard. Do not commit it to source control.
```

Store it in Render environment variables as:

```text
TIMEWALL_SECRET
```

## Supported Types

- `credit`: adds balance.
- `reversal` or `refund`: deducts balance, and adds shortage to `chargebackDebt`.
- `pending`: stores reward in `pendingRewards` and `pendingBalance`.
- `hold_cancelled`: cancels pending hold, or reverses a credited transaction if needed.

Duplicate matching transactions return:

```text
200 DUPLICATE_OK
```
