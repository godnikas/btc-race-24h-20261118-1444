// Amber Dip — cbBTC dip-buyer for btc-race-24h-20261118-1444 (make.fun).
//
// Long-only, one asset (CBBTC/USDC), 1-minute bars, $1,000 paper start.
// Idea: on 1-minute bars BTC mean-reverts after sharp air pockets. The bot
// buys only when the close has fallen a long way (2.50%) below the highest
// close of the last 120 minutes — a deep, fast dip, not a drift — and then
// rides the snap-back with a take-profit and a trailing stop. Between dips
// it sits in cash, so a slow bleed costs it nothing.
//
//   Entry : close <= max(close[-120..-1]) * (1 - 2.50%), full size.
//   Exit  : take profit at +2.60% over the entry fill price, or a 0.75%
//           trailing stop from the highest close since entry.
//   Sizing: 100% of cash on every signal (one open position max, long only).
//           A full-size round trip costs ~26 bps in fee + slippage +
//           impact, so the 2.50% trigger and exits sit far above that.
//
// No wall clock, no randomness, no network, no files. Deterministic: the
// same bars always give the same orders. Stdlib only, plus the vendored
// vendor/makefun-bars.ts shim (byte-for-byte copy of the kit SDK).

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Lookback for the dip reference high (bars).
const LOOKBACK = 120;
// Entry: close this far (bps) below the lookback high.
const DIP_BPS = 250;
// Exit: take profit this far (bps) above the entry fill price.
// (Re-tuned 18 Nov: 250 -> 260 bps; dev PnL +$26.20 -> +$26.87 alone,
// +$27.44 combined with the tighter trailing stop below.)
const TAKE_PROFIT_BPS = 260;
// Exit: trailing stop this far (bps) below the highest close since entry.
// (Re-tuned 18 Nov: 80 -> 75 bps; dev PnL +$26.20 -> +$26.77 alone.)
const TRAIL_BPS = 75;
// Orders are filled at the next bar's open; reject a fill that moved this
// far (bps) from the close we decided on, so we never chase a gap.
const MAX_SLIP_BPS = 200;

const closes: number[] = [];
let entryPrice: bigint | null = null;
let peakClose: bigint | null = null;

function bpsOf(price: bigint, ref: bigint): number {
  // (price - ref) / ref in bps, as a float; prices are positive bigints.
  return Number(((price - ref) * 10000n) / ref);
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    if (state.warmingUp) return [];

    const close = BigInt(bar.c);

    // Record fills from the previous decision: a buy fill sets the entry
    // price (and the peak); a sell fill clears the position state.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = BigInt(fill.price);
        peakClose = entryPrice;
      } else {
        entryPrice = null;
        peakClose = null;
      }
    }

    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;

    if (holding) {
      if (entryPrice !== null) {
        if (peakClose === null || close > peakClose) peakClose = close;
        const gainBps = bpsOf(close, entryPrice);
        const trailBps = peakClose !== null ? bpsOf(close, peakClose) : 0;
        if (gainBps >= TAKE_PROFIT_BPS || trailBps <= -TRAIL_BPS) {
          return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIP_BPS }];
        }
      }
      closes.push(Number(close));
      return [];
    }

    // Flat: look for a deep dip below the recent high.
    let high: number | null = null;
    const start = Math.max(0, closes.length - LOOKBACK);
    for (let i = start; i < closes.length; i++) {
      const c = closes[i]!;
      if (high === null || c > high) high = c;
    }
    closes.push(Number(close));

    if (high !== null && closes.length > 1) {
      const dipBps = ((high - Number(close)) * 10000) / high;
      if (dipBps >= DIP_BPS && state.cash > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIP_BPS }];
      }
    }
    return [];
  },
});
