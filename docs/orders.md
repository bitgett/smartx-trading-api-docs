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

## Cancelling

**Not documented, because we have not confirmed it.** Three paths were tried
against the live API and none responded as a cancel:

```
/service/poly_trade/v2/cancel_order
/service/poly_trade/cancel_order
/service/poly_trade/v2/order/cancel
```

If you need to cancel today, do it in the web app. If you find the real
endpoint, please open an issue and we will add it.

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
