# Amber Dip — cbBTC dip-buyer

Entry for `btc-race-24h-20261118-1444` ("Race a BTC trading bot live for 24 hours", make.fun).

## Strategy

Long-only, one asset (cbBTC/USDC), 1-minute bars, $1,000 paper start.

On 1-minute bars BTC mean-reverts after sharp air pockets, so the bot buys
only a deep, fast dip and rides the snap-back:

1. **Entry** — buy when the close falls ≥ **2.50%** below the highest close
   of the last 120 minutes, full size (100% of cash). Between dips it sits
   in cash, so a slow bleed costs it nothing.
2. **Exit** — take profit at **+2.50%** over the entry fill price, or a
   **0.80%** trailing stop from the highest close since entry.

A full-size round trip costs ~26 bps in fee + slippage + impact, so the
2.50% trigger and exits sit far above that. Orders fill at the next bar's
open; a fill more than 2.00% from the decided close is rejected, so the bot
never chases a gap.

No shorts, no leverage, no clock, no randomness, no network. Deterministic:
the same bars always give the same orders. Stdlib only, plus the vendored
`vendor/makefun-bars.ts` shim (byte-for-byte copy of the kit SDK).

## Local grade (published dev window, exact replay with fees/slippage/impact)

| Bot | Net PnL | Max DD | Trades | Win rate |
|---|---|---|---|---|
| **Amber Dip (DIP 250 / TP 250 / TS 80)** | **+$26.20** | 1.24% | 4 | 100% |
| Amber Dip, TP 200 | +$21.39 | 1.24% | 4 | 100% |
| Amber Dip, TS 60 | +$3.97 | 1.01% | 4 | 50% |
| Amber Dip, DIP 280 | $0.00 | 0% | 0 | — |

Dev window: -2.80% overall (slow bleed, one +2% recovery leg). Two round
trips bank the bounce after the opening drop and the mid-window recovery.
Determinism verified: L1 regrade reproduced byte for byte. Guardrails met.

## Run

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

## License

MIT
