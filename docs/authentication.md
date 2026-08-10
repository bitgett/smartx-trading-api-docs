# Authentication

You authenticate with the session token from the web app. Sign in, copy the
token out of your browser, put it in an environment variable. That is the whole
flow, and it is what our own trading clients run on.

It expires every 14 days and it carries full account access, so read
[What to know](#what-to-know) before you leave anything running unattended.
Issued API keys are on the roadmap and this page will change when they land.

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

## What to know

**It expires after about 14 days.** When it lapses every call returns `403` and
you repeat the steps above. There is no refresh endpoint, so plan for the
manual step rather than being surprised by it.

**It is your whole account.** There is no read-only variant. A script that only
watches positions holds exactly the same power as one that can sell them, so
treat the token like a password and keep it in an environment variable, never
in the code you commit.

**Signing out kills every client at once.** The token is the web session, so
logging out of the browser stops anything else using it.

**Run it on your own account, not someone else's.** Anyone holding this token
can trade with your money.

**Track the expiry yourself.** Store the date you copied it next to the token
and refresh a couple of days early, rather than finding out through a wall of
`403`s mid-position.

```json
{
  "token": "jwt eyJ...",
  "expiresAt": "2026-08-16T05:30:35.000Z"
}
```

## On the roadmap

Issued API keys, a read-only scope, and a documented refresh flow. When they
arrive this page changes and the session-token method becomes the fallback.
