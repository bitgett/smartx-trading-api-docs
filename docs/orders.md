# Orders

## Place an order

```
POST /service/poly_trade/v2/new_order
```

```json
{
  "order_type": "LIMIT",
  "token_id": "1072612513038138945515584425425304421871954896209417416257930245721829931930",
  "side": "BUY",
  "cents_price": 39,
  "share_amount": 631,
  "usdc_budget": 249.25
}
```

| field | type | notes |
|---|---|---|
| `order_type` | string | `LIMIT` or `MARKET` |
| `token_id` | string | the outcome you are buying. See [Markets](markets.md) |
| `side` | string | `BUY` or `SELL` |
| `cents_price` | integer | 1 to 99. Whole cents only, `39` means $0.39 per share |
| `share_amount` | integer | **not honoured.** See below |
| `usdc_budget` | number | what you are prepared to spend, fees included. This is what sets your size |

`token_id` is a long decimal string. Send it as a string. Put it through a
JavaScript number and you will silently corrupt it past 2^53.

### `usdc_budget` sets your size, `share_amount` does not

Send `share_amount: 5` and you will not get 5 shares. Size comes from
`usdc_budget`, and `share_amount` comes back overwritten with what was actually
placed. Every order below sent `share_amount: 5` at a 2c limit, on an account
holding $0.189852 of free pUSD:

| sent `usdc_budget` | shares placed | notional | |
|---|---|---|---|
| 0.10 | 5 | 0.10 | as asked |
| 0.12 | 6 | 0.12 | as asked |
| 0.15 | 7.5 | 0.15 | as asked |
| 0.20 | 9.4926 | 0.189852 | **silently capped to the free balance** |
| 0.25 | — | — | rejected, `60300 insufficient pUSD balance` |

So: `shares = usdc_budget / price`, exactly, until the budget runs past your
free balance.

**A budget slightly over your balance is quietly reduced.** No error, no flag.
The 0.20 order came back as 0.189852 and nothing in the response said it had
been trimmed. Go far enough over and you get `60300` instead, but there is a
band where you simply get a smaller position than you asked for.

**Read your size back.** The order record carries the real `share_amount`,
`qty_num` and `usdc_budget`. Anything downstream that depends on position size,
hedging above all, has to use those and not the numbers you sent.

**Sizes are fractional.** `9.4926` and `7.5` shares are normal results. Do not
assume integers.

**Minimum 5 shares.** Below that you get `60307 limit order shares must be >= 5`.
At a 2c limit that is a $0.10 floor; at 50c it is $2.50.

### You do not need a balance check

There is no balance endpoint ([Positions](positions.md#cash-balance)) and for
most clients that is fine: send the order, and `60300` tells you when you are
out of money.

The one thing you cannot skip is reading `share_amount` back, because of the
silent cap above. Failure is loud, but a short fill is not.

**Response**

```json
{ "code": 200, "msg": "success", "data": { "order_id": "...", "order_status": "..." } }
```

### A 200 is not a fill

`code: 200` means SmartX accepted the intent. The order can still fail on
execution, and when it does you will not hear about it here. It shows up later
in the order list with `order_status: "failed"` and a populated `error_msg`.

This one is worth internalising, because it has cost us money. A bot that reads
`200` as "filled" and moves on will keep sizing new orders against a balance it
no longer has, and every subsequent order fails on insufficient funds.

**After placing, confirm all three:**

1. the order, via [list orders](#list-your-orders), for `order_status`
2. the position, via [positions](positions.md), for the shares that actually landed
3. your remaining balance, before sizing the next one

## List your orders

```
GET /service/poly_trade/orders?status=&condition_id=
```

Both parameters are optional. Omit `status` for everything.

```json
{
  "code": 200,
  "data": {
    "list": [ { } ],
    "page_num": 1,
    "page_size": 20,
    "total": 58
  }
}
```

Each entry:

| field | meaning |
|---|---|
| `id` | SmartX row id |
| `order_id` | order reference. Locally rejected orders get a `local_fail_…` id |
| `token_id` | the outcome |
| `condition_id` | the market this outcome belongs to |
| `side` | `Buy` or `Sell` |
| `order_type` | `Limit` or `Market` |
| `qty_num`, `share_amount` | shares requested |
| `usdc_budget` | budget sent with the order |
| `filled_share`, `filled_usdc` | what actually executed |
| `remaining` | shares still open |
| `limit_price`, `avg_price` | in cents |
| `order_status` | `failed`, and the other lifecycle states |
| `exchange_status` | venue-side state, for example `FAILED` |
| `error_msg` | populated on failure, and specific. Read it |

`error_msg` is the useful field. A real one:

```
failed to execute order: not enough balance / allowance:
balance: 2211247, sum of active orders: 2001300,
sum of matched orders: 0, order amount (inc. fees): 210000
```

Those are micro-USDC, so 6 decimal places: `2211247` is $2.21. Note that resting
orders are counted against you. Available is not your balance, it is your
balance minus everything already working.

## Cancel an order

```
POST /service/poly_trade/cancel_order
```

```json
{ "order_id": "0x2777438d…" }
```

The field is `order_id`, singular. There is no batch form: sending `order_ids`
returns `60030 order_id is required`. To cancel several orders, loop.

Cancelled orders appear in the order list as `order_status: "cancelled"` and
`exchange_status: "CANCELED"`.

### Do not use `v2/cancel_order`, its response is inverted

There is also a `v2/cancel_order`. It cancels correctly, but its status code
means the opposite of what you would expect. Run against real resting orders and
against ids that never existed, on two separate accounts:

| call | order cancelled | code returned |
|---|---|---|
| `v2/cancel_order`, real order | **yes** | `50000 internal server error` |
| `v2/cancel_order`, unknown id | no, nothing to do | `200 success` |
| `cancel_order`, real order | **yes** | `200 success` |
| `cancel_order`, unknown id | no, nothing to do | `200 success` |

`v2` reports failure exactly when it succeeds. The shape of that is a handler
that performs the cancel and then throws while building its response, so the
`50000` is a symptom rather than a result.

Use `cancel_order`. It does the same work and reports it correctly. The only
thing it will not do is tell you that an order id was unknown, which is why the
check below is still worth keeping.

```js
await api.cancelOrder(orderId).catch(() => {});   // the response is not evidence

await new Promise(r => setTimeout(r, 1500));
const { list } = await api.orders({});
const row = list.find(o => o.order_id === orderId);
if (row && !/cancel/i.test(row.order_status)) {
  throw new Error(`cancel did not take: still ${row.order_status}`);
}
```

### Do not chain the two paths

A loop that tries `v2/cancel_order`, reads `50000` as failure, and falls through
to `cancel_order` will report success on every call regardless of what happened,
because the fallback returns `200` unconditionally. And the `50000` it was
reacting to meant the cancel had already gone through.

Send one request to `cancel_order` and ask the order list what happened.

## Before you go live

**Size for fees.** `usdc_budget` has to cover the fee as well as the shares. A
budget of exactly `shares × price` fails.

**Watch the whole set of resting orders.** Available balance is reduced by every
open order, not just filled ones. A stack of unfilled limits will starve the
next order without any of them having cost you anything yet.

**Cap what one call can spend.** Our own client refuses anything over a fixed
per-order ceiling and asks for confirmation before sending. A typo in a size
field is otherwise a real loss.

**Prices are whole cents.** `cents_price` is an integer from 1 to 99. There is
no sub-cent pricing.
