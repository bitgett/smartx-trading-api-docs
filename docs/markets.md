# Markets

To place an order you need a `token_id`: the identifier of one outcome of one
market. This page is how you get from a market you can see in the app to the id
you send to the API.

## Market detail

```
GET /analytics/api/v1/markets/slug?slug=<market-slug>
```

The slug is the last part of the market's URL in the app:

```
https://app.smartx.io/market?market=highest-temperature-in-amsterdam-on-august-3-2026-32c
                              ^------------------ slug ------------------^
```

The market sits one level down, under `data.market`, and its outcomes are in
`data.market.outcomes`:

```json
{
  "code": 0,
  "data": {
    "market": {
      "condition_id": "0x211f2f58…",
      "event_id": "780132",
      "slug": "will-bitcoin-dip-to-60k-in-august-2026",
      "question": "Will Bitcoin dip to $60,000 in August?",
      "desc": "This market will immediately resolve to \"Yes\" if …",
      "category": "…",
      "is_close": false,
      "is_active": true,
      "end_date": "…",
      "vol": 0, "vol_24h": 0, "traders": 0, "liq": 0,
      "fee_rate": 0,
      "outcomes": [
        {
          "outcome_index": 0,
          "outcome_text": "Yes",
          "token_id": "88902974378195889166057110964513688920047250482309636378282580896757420591128",
          "condition_id": "0x211f2f58…",
          "price_24h_ago": 0.3
        }
      ]
    },
    "event_slug": "…",
    "tags": [], "series": [], "price_series": []
  }
}
```

Two field names to get right, because the obvious guesses are wrong:

- the label is **`outcome_text`**, not `outcome` or `name`
- the market is nested at **`data.market`**, not at `data`

`token_id` from the outcome you want is what goes into
[a new order](orders.md#place-an-order).

**`desc` is the settlement rule.** It states the exact source and threshold the
market resolves against. Read it before trading a market you did not create,
because two markets with near-identical titles can settle off different sources.

## Other read endpoints

All under `/analytics/api/v1/`, all read only.

| endpoint | returns |
|---|---|
| `markets/slug` | one market: outcomes, `token_id`, prices, settlement state |
| `signal/list` | current signals across markets |
| `signal/list/by_market_slug` | signals and holders for one market |
| `markets/holders/list` | who holds a market (POST) |
| `markets/trades/list` | trade history for a market (POST) |
| `markets/trades/top` | largest trades in a market (POST) |
| `sm/list` | tracked wallets |
| `sm/support_category` | market categories |
| `user/tags` | labels on a wallet |
| `user/trading_analysis` | a wallet's win rate and PnL |
| `user/category_analytics` | a wallet's record split by category |
| `sm/wallets/profile/batch` | several wallet profiles at once (POST) |

These are the same endpoints the app itself calls.

## Two identifiers, do not mix them

**`token_id`** identifies one *outcome*. A yes/no market has two, and they are
different ids. Orders take this.

**`condition_id`** identifies the *market*. It is the `0x…` value. Filters such
as `market_position` and the `condition_id` parameter on `orders` take this.

Sending a `condition_id` where a `token_id` belongs will not place the order you
meant.

## Handling ids safely

`token_id` is a long decimal string, well past what a double can hold:

```
107261251303813894551558442542530442187195489620941741625793024572182993193070
```

Keep it a string end to end. `JSON.parse` in JavaScript will turn it into a
number and quietly lose precision, and the resulting order references an outcome
that does not exist. If you parse responses generically, either use a JSON
parser with big-integer support or pull the field out of the raw text before
parsing.

## Prices

Prices are in cents, 1 to 99, as integers. A price of `39` is $0.39 per share,
and a share pays $1.00 if that outcome wins. So the price is also roughly the
market's implied probability: `39` reads as the market pricing that outcome
around 39 percent.

Nothing in this API tells you what an outcome is *worth*. It tells you what it
currently *costs*.
