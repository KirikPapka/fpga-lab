/* Lesson 3: trigger and send the order. */
(function (LAB) {
  'use strict';
  LAB.lessons.push({
    title: 'trigger and order',
    about: `
<p>The strategy: when LEAD moves and TGT's quote has not caught up yet, trade TGT at its old price.</p>
<p>If <code>lead_bid ≥ tgt_ask + threshold</code>, TGT's ask is stale: buy it. If <code>lead_ask + threshold ≤ tgt_bid</code>, TGT's bid is stale: sell to it. That is two adders and two comparators, finished within one clock.</p>
<p>Software is not in this path. It only writes <code>threshold</code> and <code>armed</code> into control registers; the hardware then fires on its own and streams the order out.</p>
<p><em>Tick-to-trade</em> is the time from the first byte of market data in to the first byte of the order out. It is the number these teams compete on.</p>`,
    tryThis: [
      'Run. At cycle 59 the first order leaves: buy 300 TGT at 100.02, 11 cycles (70.4 ns) after its market data started arriving.',
      'Switch to the 64-bit bus and run again: the same order now takes 4 cycles, 25.6 ns.',
      'Set the threshold to 6: the opening 5-tick jump no longer fires. At 1 you trade more often, each time for a thinner edge.',
      'Turn off <code>armed</code>. This is the switch software flips when something looks wrong.',
      'Click the blocks in the strip to read each one’s Verilog.',
    ],
    simplified: `<p>There are no risk checks. Real systems must also check position limits, price bands and order rates before anything leaves the chip, and the link to the exchange is a TCP session, not a raw byte stream. The order format is made up.</p>`,
    mount(ctx) {
      this.view = LAB.pipelineLesson(ctx, 3);
    },
  });
})(globalThis.LAB);
