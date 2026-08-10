# Errors

## Check `code`, not the HTTP status

```json
{ "code": 200, "msg": "success", "data": { } }
```

A request can return HTTP 200 carrying an error `code`. Branch on `code`.

## The two families disagree on what success is

This one catches everybody. Success is a different number depending on which
half of the API you are calling:

| path | success `code` |
|---|---|
| `/service/poly_trade/…` | `200` |
| `/analytics/api/v1/…` | `0` |

Both return `msg: "success"`. Check either one and half the API will look
broken, so accept both:

```js
const res = await fetch(url, { headers });
const body = await res.json();
if (body.code !== 200 && body.code !== 0) {
  throw new Error(`${body.code} ${body.msg}`);
}
```

## Codes seen in practice

| code | meaning | what to do |
|---|---|---|
| `0` | success, on `/analytics/…` | |
| `200` | success, on `/service/…`. For orders this is *accepted*, not filled | see [Orders](orders.md#a-200-is-not-a-fill) |
| `401` | unauthorized | check the scheme is `jwt` and not `Bearer`, then check the token has not expired |
| `10002` | invalid parameters | a required query parameter is missing or malformed |
| `20003` | market not found | the slug does not exist. Confirm it against the app URL |

## HTTP statuses

| status | usual cause |
|---|---|
| `403` | missing `origin` / `referer` headers, or an expired token. Check the headers first, they are the more common cause |
| `404` | the path does not exist. `portfolio` and `user_info` both 404 and are not real endpoints |
| `200` | reached the API. Now read `code` |

## The 403 that is not an auth problem

Requests without `origin: https://app.smartx.io` and `referer: https://app.smartx.io/`
are rejected at the edge before reaching the API. The response is a bare `403`
with no envelope, which reads exactly like a bad token.

If a token you just copied returns `403`, send the same request with a normal
browser user agent and both headers set before concluding it expired. A default
HTTP client user agent is enough to get blocked on its own.

## Order failures are asynchronous

An order that passes validation can still fail at the venue. That failure does
not come back on the POST. It appears later on the order record:

```json
{
  "order_status": "failed",
  "exchange_status": "FAILED",
  "error_msg": "failed to execute order: not enough balance / allowance: balance: 2211247, sum of active orders: 2001300, sum of matched orders: 0, order amount (inc. fees): 210000"
}
```

Amounts in that message are micro-USDC, six decimals: `2211247` is $2.21.

Note `sum of active orders`. Resting orders are held against your balance, so
available funds are the balance minus everything already working, not the
balance itself.

Poll the order list after placing. There is no callback.
