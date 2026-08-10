# Authentication

> **This is the interim method.** SmartX does not issue API keys yet, so today a
> client authenticates with the same session token the web app uses. It works,
> and it is what our own bots run on, but it expires and it cannot be rotated
> programmatically. A proper key flow is the open item on this API. If you are
> building something you intend to leave unattended, read [Known limits](#known-limits)
> first.

## Headers

Every request to `/service/poly_trade/…` needs these:

```
authorization: jwt <token>
content-type:  application/json; charset=utf-8
origin:        https://app.smartx.io
referer:       https://app.smartx.io/
accept:        */*
```

`origin` and `referer` are not optional. Requests without them are rejected at
the edge with a `403` before they reach the API, which looks like an auth
failure but is not one. If you get a `403` on a token you believe is good, check
these two headers first.

## Getting a token

1. Sign in at [app.smartx.io](https://app.smartx.io).
2. Open your browser's developer tools and go to the Network tab.
3. Do anything that loads data, for example open a market.
4. Click any request to `api-grey.smartx.io`.
5. Copy the full value of the `authorization` request header, including the
   leading `jwt `.

```bash
export SMARTX_TOKEN="jwt eyJhbGciOi..."
```

Keep it out of source control. Treat it exactly as you would a password: it can
place and sell orders on your account.

## Known limits

**It expires.** Tokens last about 14 days. When one lapses every call starts
returning `403` and you repeat the steps above. There is no refresh endpoint
exposed to clients.

**It cannot be scoped.** The token carries your whole session. There is no
read-only variant, so a process that only needs to watch positions holds the
same power as one that can liquidate them.

**It cannot be revoked individually.** Signing out invalidates the session,
which takes down every client using it at once.

**Automate the expiry, do not fight it.** Store the issue date next to the
token, alert yourself two days before the 14 days are up, and refresh on a
schedule rather than discovering it through a wall of `403`s at the worst
moment.

```json
{
  "token": "jwt eyJ...",
  "expiresAt": "2026-08-16T05:30:35.000Z"
}
```

## What we are asking the platform for

Recorded here so the gap is visible rather than folklore:

1. Issued API keys, created and revoked from account settings
2. A read-only scope, so a monitoring process cannot trade
3. Documented lifetime and a refresh endpoint
4. Per-key rate limits, published

Until those exist, this page describes the only method available.
