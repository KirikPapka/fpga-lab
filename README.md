# fpga-lab: tick-to-trade, one clock at a time

A zero-setup way to try what an FPGA engineer at a trading firm does. You step a
tick-to-trade pipeline clock by clock (market data in, order out), read the real
Verilog for each block with the active line lit, squeeze it into a clock period,
and race other traders for a stale quote. No board, no toolchain, no install.

## Open it

**Live: https://kirikpapka.github.io/fpga-lab/**

Or download the folder and double-click `index.html`. It runs offline in any
modern browser: plain HTML, CSS and JavaScript, no build step, no network requests.

Keys: `space` step · `r` run/pause · `←` `→` scrub through history · `1`–`6` lesson.
Click any cycle in the waveform to inspect it, and click a block in the strip to
see its Verilog.

## Lessons

| # | Lesson | What you do | What it teaches |
|---|---|---|---|
| 0 | clock and register | Step a counter and a two-register chain | Every flip-flop updates on the same clock edge |
| 1 | parse | Step a market data message through a byte-by-byte decoder; switch the bus from 8 to 64 bits | Decoding in hardware; a wider bus buys cycles |
| 2 | book | Move the market with buttons and watch best bid/ask registers | State lives in registers; one cycle per update |
| 3 | trigger and order | Set the threshold, arm it, run the whole path | The fast path; tick-to-trade 70.4 ns (8-bit) or 25.6 ns (64-bit) |
| 4 | meet timing | Click to place pipeline registers; pick the clock | Slack, timing failure, why a faster clock can mean higher latency |
| 5 | race | Tune your latency, cable length, rival and software | Winner takes all; 1 m of cable ≈ 5 ns; jitter |

Lessons 0–3 run one cycle-accurate simulator. Lessons 4 and 5 are small models.

## Three-minute demo

1. **Lesson 0 (30 s).** Turn on `d_in`, press space three times. `a` gets it on the
   next edge and `b` one edge later. Point at `b <= a`: it reads the old `a`.
   "Hardware is not a list of instructions; everything happens on the clock edge."
2. **Lesson 1 (30 s).** Step through one message and watch `msg_price` fill in a
   byte at a time. Switch to 64-bit: the status line goes from 8 cycles to 1.
3. **Lesson 3 (45 s).** Press `r`. At cycle 59 the first order leaves: buy 300 TGT
   at 100.02, tick-to-trade 11 cycles = 70.4 ns. Switch to 64-bit, run again:
   25.6 ns. Set the threshold to 6: the same jump no longer fires.
4. **Lesson 4 (45 s).** At 156.25 MHz with no registers, timing fails. Click the gap
   after `edges`: timing met, 12.8 ns, which is par. Switch to 390.625 MHz and
   press `use par`: 7 stages, 17.9 ns. The faster clock is slower end to end.
5. **Lesson 5 (30 s).** Defaults: you win about 80% against a rival 2.4 ns slower.
   Add 1 m of cable: you drop to under 20%. Software at 5 µs never wins.

## How it is checked

```bash
node test/run_tests.js
```

- Unit tests on the JavaScript models: decode timing, book updates, trigger, the
  exact order bytes, tick-to-trade cycle counts, one order per opportunity, the
  timing puzzle's par, and the race odds.
- The Verilog on the page is exported to `rtl/*.v` (generated from
  `js/verilog.js`; do not edit `rtl/` by hand).
- If [Icarus Verilog](https://steveicarus.github.io/iverilog/) is installed
  (`brew install icarus-verilog`), the tests run that Verilog on 6,000 cycles of
  the same seeded feed, with resets, disarming and threshold changes, for both
  bus widths, and require every probed signal to match the JavaScript model on
  every cycle. Last run: about 246,000 values compared, 73 orders, zero
  differences. The page's waveforms are therefore what a real Verilog simulator
  produces for that code.

## What is simplified

- Delay, area and latency numbers in lessons 4 and 5 are illustrative orders of
  magnitude, not measurements from a board.
- The feed is synthetic and its 8-byte message format is made up, loosely modelled
  on real binary feeds (ITCH, SBE). Ethernet, IP and UDP layers are skipped.
- The book keeps only the best bid and ask; real designs track every level.
- No risk checks, no TCP session to the exchange, no exchange matching queue.
- The clock is a label: 156.25 MHz, the clock of a 10 Gb/s Ethernet port with a
  64-bit datapath.

## Files

```
index.html           page shell
css/lab.css          terminal look (colours are CSS variables on :root)
js/sim.js            cycle simulator: two-phase evaluate/commit, like Verilog <=
js/feed.js           seeded synthetic market and byte stream
js/modules.js        JavaScript models of each Verilog block, line for line
js/verilog.js        the Verilog shown on the page (source of truth for rtl/)
js/wave.js           canvas waveform viewer
js/timing.js         lesson 4 model and timing report
js/race.js           lesson 5 Monte Carlo
js/ui.js             layout, controls, keyboard, shared simulation viewer
js/lessons/          one file per lesson
rtl/                 generated Verilog files
test/run_tests.js    tests and the Icarus Verilog cross-check
```
