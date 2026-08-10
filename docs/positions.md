# Positions

## All positions

```
GET /service/poly_trade/positions?page_num=1&page_size=100
```

```json
{
  "code": 200,
  "data": { "list": [ { } ], "page_num": 1, "page_size": 100, "total": 3 }
}
```

Each entry:

| field | meaning |
|---|---|
| `token_id` | the outcome held |
| `outcome` | the outcome's label. Often `Yes` / `No`, but it is whatever the market names it, for example a team name |
| `market_title` | the question, as shown in the app |
| `market_slug`, `event_slug`, `event_id` | identifiers for the market and its parent event |
| `outcome_index` | which outcome within the market |
| `shares` | size held, fractional |
| `avg_entry_cents` | average entry price in cents |
| `mark_cents` | current mark. `0` once a losing market has resolved |
| `market_status` | `Resolved` and the other lifecycle states |
| `is_winner` | set once resolved |
| `position_value` | mark value now |
| `cost_basis` | what it cost |
| `realized_pnl`, `unrealized_pnl`, `total_pnl` | in USDC |
| `redeemable` | winnings are available to claim |
| `action` | what the app would offer, for example `Claim` |

A resolved loser looks like this: `mark_cents` 0, `position_value` 0,
`unrealized_pnl` equal to negative `cost_basis`, `is_winner` false.

## One market

```
GET /service/poly_trade/market_position?condition_id=0x…
```

Same entry shape, filtered to a single market. Use it after placing an order to
confirm what actually landed rather than trusting the order response.

## Reading PnL correctly

**`unrealized_pnl` on a resolved market is not unrealized.** Once a market
settles the loss is final, but it stays in the unrealized column until the
position is cleared. Sum the two fields rather than reading either alone.

**`redeemable` means claimable, not credited.** A winning position marked
`redeemable` has not yet paid into your balance, so treating a resolved win as
spendable will oversize the next order. Wait for the balance to move.

## Cash balance

There is no endpoint for your cash balance. `positions` values what you hold,
not what you have left to spend. Two paths that look like they should work do
not exist:

```
GET /service/poly_trade/portfolio    404
GET /service/poly_trade/user_info    404
```

**You mostly do not need one.** Send the order you want and let it answer: a
budget well over your free balance is rejected with `60300 insufficient pUSD
balance`, which is the same information a balance check would have given you,
one step later.

**When you do need the number**, `examples/check-balance.mjs` measures it:

```bash
node examples/check-balance.mjs
```
```
free balance: 5.292195 USDC   [14 probes]

at these prices that is:
   5c       105.84 shares
  50c        10.58 shares
  75c         7.06 shares
```

It works by narrowing in on the trimming band described in
[Orders](orders.md#usdc_budget-sets-your-size-share_amount-does-not): a budget
slightly over your balance comes back reduced to exactly what you have, which
is the number. Each step places a limit far below the book and cancels it, so
nothing can fill, but it does take a dozen or so orders to converge. Cache the
result; do not call it before every trade.

⚠️ **With one exception, and it matters.** A budget only *slightly* over your
balance is not rejected. It is silently reduced to whatever you have, with no
error and nothing in the response marking it. You asked for $0.20, you own
$0.19 worth, and only the order record shows it.

So "the order failed, therefore I am out of money" is safe, but "the order
succeeded, therefore I got what I asked for" is not. Read `share_amount` back
off the order after placing. See
[Orders](orders.md#usdc_budget-sets-your-size-share_amount-does-not).
