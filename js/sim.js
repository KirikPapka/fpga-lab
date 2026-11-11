/* fpga-lab: cycle simulator kernel and value formatting.
 *
 * A design is an object with three functions:
 *   init()                -> registers at power-up
 *   eval(regs, inputs)    -> snapshot: every signal's value during this cycle
 *   next(regs, inputs)    -> registers after the next rising clock edge
 *
 * `next` builds a fresh object from the current values only. That is what
 * Verilog's non-blocking `<=` means: every register samples its input at the
 * same instant, so `b <= a` always sees the old `a`, whatever the line order.
 */
(function (LAB) {
  'use strict';

  class Sim {
    constructor(design) {
      this.design = design;
      this.reset();
    }

    reset() {
      this.regs = this.design.init();
      this.history = [];
    }

    get cycle() {
      return this.history.length;
    }

    step(inputs) {
      const snap = this.design.eval(this.regs, inputs);
      snap.cycle = this.history.length;
      const next = this.design.next(this.regs, inputs);
      this.history.push(snap);
      this.regs = next;
      return snap;
    }

    // What the registers would hold after the next edge, without stepping.
    peek(inputs) {
      return this.design.next(this.regs, inputs);
    }
  }

  const NAMES = { 0x01: 'LEAD', 0x02: 'TGT' };

  const fmt = {
    hex(v, bits) {
      const digits = Math.max(1, Math.ceil(bits / 4));
      const s = typeof v === 'bigint' ? v.toString(16) : (v >>> 0).toString(16);
      return s.padStart(digits, '0');
    },
    // Prices are integers in ticks of 0.01.
    px(ticks) {
      return ticks ? (ticks / 100).toFixed(2) : '—';
    },
    inst(v) {
      return NAMES[v] || '0x' + fmt.hex(v, 8);
    },
    ascii(v) {
      return v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : '';
    },
    ns(x, digits = 1) {
      return x.toFixed(digits) + ' ns';
    },
    // Human-friendly time from nanoseconds.
    time(nsVal) {
      if (nsVal < 1000) return nsVal.toFixed(nsVal < 100 ? 1 : 0) + ' ns';
      if (nsVal < 1e6) return (nsVal / 1000).toFixed(nsVal < 1e4 ? 2 : 1) + ' µs';
      return (nsVal / 1e6).toFixed(2) + ' ms';
    },
  };

  LAB.Sim = Sim;
  LAB.fmt = fmt;
  LAB.CLOCK_MHZ = 156.25; // 10G Ethernet with a 64-bit datapath
  LAB.PERIOD_NS = 1000 / LAB.CLOCK_MHZ; // 6.4 ns
})((globalThis.LAB = globalThis.LAB || {}));
