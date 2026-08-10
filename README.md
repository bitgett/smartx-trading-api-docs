# SmartX Trading API

Unofficial. Community notes, not published by SmartX.

Place and manage prediction-market orders on SmartX from your own code.

SmartX runs the execution side for you. You send an intent (which outcome, which
side, what price, how much) and the platform signs and submits it, so there is no
wallet plumbing, no gas handling, and no key management in your client.

> Everything here was verified against the live API on 2026-08-10, on two
> accounts, including the parts that behave oddly. Start with
> [Authentication](docs/authentication.md), then [Orders](docs/orders.md).

---

## What you can do today

| | |
|---|---|
| Place an order | limit or market, buy or sell, sized in USDC |
| Cancel an order | one at a time, and always verify. See [Orders](docs/orders.md#cancel-an-order) |
| List your orders | with fill state, average price, and failure reasons |
| List your positions | shares, entry, mark, realised and unrealised PnL |
| Inspect one market | your position in a single market |
| Read market data | prices and outcome ids for any listed market |

| Measure your balance | there is no endpoint, so `examples/check-balance.mjs` works it out. See [Positions](docs/positions.md#cash-balance) |

## Quickstart

Node 18 or newer, no dependencies to install.

```bash
git clone https://github.com/bitgett/smartx-trading-api-docs
cd smartx-trading-api-docs

export SMARTX_TOKEN="jwt eyJ..."      # see docs/authentication.md
node examples/list-positions.mjs
```

If that prints your positions, you are connected.

**Three things to know before your first order**, each of which has surprised
someone already:

1. **The minimum order is 5 shares**, so the minimum spend scales with price. At
   a 2c limit that is $0.10; at 50c it is $2.50. Below it you get
   `60307 limit order shares must be >= 5`.
2. **`usdc_budget` sets your size, `share_amount` is ignored.** Read the real
   size back off the order afterwards.
3. **`200` means accepted, not filled.** Orders can fail later, asynchronously.

All three are in [Orders](docs/orders.md), which is worth reading in full before
you send anything with real size behind it.

## Base URL

```
https://api-grey.smartx.io
```

Two families live under it:

- `/service/poly_trade/…` — your account: orders, positions
- `/analytics/api/v1/…` — market and wallet data, read only

## Every response uses the same envelope

```json
{ "code": 200, "msg": "success", "data": { } }
```

`code` is the one to branch on, not the HTTP status: a request can return
HTTP 200 with `code` set to an error.

⚠️ **Success is `200` under `/service/…` and `0` under `/analytics/…`.** Both
say `msg: "success"`. Accept both or half the API will look broken. See
[Errors](docs/errors.md).

## Contents

- [Authentication](docs/authentication.md)
- [Orders](docs/orders.md)
- [Positions](docs/positions.md)
- [Markets](docs/markets.md)
- [Errors](docs/errors.md)
- [Examples](examples/)

## Before you go live

Read [Orders](docs/orders.md#before-you-go-live). The one that has actually cost
money is treating `200` as a fill: the order can fail later, the client never
hears about it, and it keeps sizing the next order against money it no longer
has.

---

Maintained independently of SmartX. The API can change without this repo
knowing, so if the docs and the API disagree, the API is right. Open an issue
and it gets fixed.
