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

There is no endpoint that returns your USDC cash balance. `positions` values
what you hold, not what you have left to spend.

Two paths that look like they should work do not:

```
GET /service/poly_trade/portfolio    404
GET /service/poly_trade/user_info    404
```

In practice the only reliable read on free cash is the failure message from a
rejected order, which reports balance and committed funds in micro-USDC. See
[Orders](orders.md#list-your-orders). Checking the app is the alternative.

This is a real gap for unattended clients and is on the list in
[Authentication](authentication.md#what-we-are-asking-the-platform-for).
