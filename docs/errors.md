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
| `50000` | internal server error | from `v2/cancel_order` it means the cancel *worked*; use `cancel_order` instead and this stops appearing. Anywhere else, a real error |
| `60030` | `order_id is required` | cancel takes `order_id`, singular. There is no batch form |
| `60300` | `insufficient pUSD balance` | budget is well over your free balance. Note that a budget only *slightly* over is capped silently instead, see [Orders](orders.md#usdc_budget-sets-your-size-share_amount-does-not) |
| `60307` | `limit order shares must be >= 5` | the minimum order is 5 shares, so the minimum spend scales with the limit price |

## A response code is not an outcome

Three places where the code and what actually happened come apart:

| call | says | does |
|---|---|---|
| `new_order` → `200` | accepted | may still fail at the venue, asynchronously |
| `v2/cancel_order` → `50000` | server error | cancels the order. Use `cancel_order` and avoid this |
| `cancel_order` → `200` on an unknown id | success | nothing, there was no such order |

In all three the order list is the authority. Poll it.

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
