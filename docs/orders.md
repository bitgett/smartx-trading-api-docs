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
| `share_amount` | integer | number of shares |
| `usdc_budget` | number | what you are prepared to spend, fees included |

`token_id` is a long decimal string. Send it as a string. Put it through a
JavaScript number and you will silently corrupt it past 2^53.

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
POST /service/poly_trade/v2/cancel_order
```

```json
{ "order_id": "..." }
```

The field is `order_id`, singular. There is no batch form: sending `order_ids`
returns `60030 order_id is required`. To cancel several orders, loop.

### Two paths exist and they behave differently

| path | on a valid order | on an id that does not exist |
|---|---|---|
| `v2/cancel_order` | cancels | `50000 internal server error` |
| `cancel_order` | cancels | **`200 success`** |

That second row is not a typo. The unversioned `cancel_order` returns
`code: 200, msg: "success"` for an order id that was never real, verified
against the live API on 2026-08-10.

**Use `v2/cancel_order`, and verify afterwards regardless.** A success response
from either path is not evidence the order is gone.

```js
await api.cancelOrder(orderId);

// the response cannot be trusted; the order list can
const { list } = await api.orders({});
const still = list.find(o => o.order_id === orderId);
if (still && !/cancel/i.test(still.order_status)) {
  throw new Error(`cancel did not take: still ${still.order_status}`);
}
```

Cancelled orders show up in the order list with `order_status: "cancelled"`.

### If you are falling back between paths, do not

A retry loop that tries `v2/cancel_order` and falls through to `cancel_order` on
failure will report success every time, because the fallback always succeeds.
The first path failing is real information and swallowing it turns a failed
cancel into a silent one. Ask the order list instead.

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
