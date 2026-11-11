/* Lesson 1: parse a market data message. */
(function (LAB) {
  'use strict';
  LAB.lessons.push({
    title: 'parse',
    about: `
<p>An exchange sends market data as a stream of small binary messages. Software would read a whole packet into memory and then decode it. The FPGA decodes each byte the moment it arrives.</p>
<p>A 3-bit counter <code>idx</code> says which byte comes next, and each byte is written straight into its field. When the last byte lands, <code>msg_valid</code> pulses for one cycle so the next block knows the fields are complete.</p>
<p>Message format, 8 bytes: type (<code>Q</code> quote or <code>T</code> trade), instrument, side (<code>B</code> bid or <code>S</code> ask), price in ticks of 0.01 (3 bytes), size (2 bytes).</p>`,
    tryThis: [
      'Step through one message and watch <code>msg_price</code> fill in one byte at a time.',
      'Press <em>send trade print</em> and step it through: type <code>T</code> (0x54) is decoded, but <code>msg_valid</code> stays low because the book only wants quotes.',
      'Switch the bus to 64-bit. The whole message now arrives in one clock and is decoded in one: the status line shows 1 cycle instead of 8.',
    ],
    simplified: `<p>Real feeds (Nasdaq ITCH, CME MDP 3.0, and so on) have dozens of message types, arrive inside Ethernet, IP and UDP headers, and messages often straddle bus words. A real 10 Gb/s port delivers 8 bytes per clock; the 8-bit mode is here so you can watch each byte.</p>`,
    mount(ctx) {
      this.view = LAB.pipelineLesson(ctx, 1);
    },
  });
})(globalThis.LAB);
