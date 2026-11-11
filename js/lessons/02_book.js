/* Lesson 2: keep the top of book in registers. */
(function (LAB) {
  'use strict';
  LAB.lessons.push({
    title: 'book',
    about: `
<p>The parser's output updates a <em>top of book</em>: the best bid and best ask for each instrument, held in registers. This feed sends the new best price whenever it changes, so updating the book is just loading a register.</p>
<p>There are two instruments. <b>LEAD</b> is where prices move first (think of an index future). <b>TGT</b> follows a little later (think of an ETF on the same index). That delay is what the next lesson trades on.</p>
<p>The random feed is off here so you control the market with the buttons.</p>`,
    tryThis: [
      'Run until the book fills (four quotes), then pause.',
      'Press <em>lead +5</em> and step. The new price lands in <code>lead_bid</code> exactly one cycle after <code>msg_valid</code>.',
      'Count the cycles from a message’s first byte to the book changing: 9 on the 8-bit bus, 2 on the 64-bit bus.',
      'Press <em>target catches up</em>: TGT’s quotes move to match LEAD.',
    ],
    simplified: `<p>A real book tracks every price level, often thousands of orders, in on-chip memory, and handles adds, changes and cancels. Many firms keep the full book in software and give the FPGA only the few numbers its trigger needs.</p>`,
    mount(ctx) {
      this.view = LAB.pipelineLesson(ctx, 2);
    },
  });
})(globalThis.LAB);
