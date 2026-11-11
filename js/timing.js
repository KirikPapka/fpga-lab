/* fpga-lab: lesson 4 model. A chain of logic operations between two
 * registers; the learner places pipeline registers between them.
 *
 * Delays are illustrative orders of magnitude for a modern FPGA, not
 * measurements: real numbers depend on the chip, placement and routing.
 */
(function (LAB) {
  'use strict';

  // bits = width of the data crossing a register placed after this operation
  const ops = [
    { name: 'decode', long: 'decode header', delay: 0.9, bits: 64 },
    { name: 'match', long: 'match instrument', delay: 1.4, bits: 58 },
    { name: 'book', long: 'update book', delay: 1.6, bits: 96 },
    { name: 'edges', long: 'price edges (2 subtracts)', delay: 1.8, bits: 50 },
    { name: 'compare', long: 'compare with threshold', delay: 1.2, bits: 26 },
    { name: 'risk', long: 'risk check', delay: 1.5, bits: 27 },
    { name: 'order', long: 'build order', delay: 1.1, bits: 64 },
  ];

  const REG = 0.4; // clock-to-output of the launching register + setup time of the capturing one, ns
  const IO_FLOPS = 128; // input and output registers, always there

  const clocks = [
    { mhz: 156.25, note: '10 Gb/s Ethernet, 64-bit bus' },
    { mhz: 322.27, note: '10 Gb/s Ethernet, 32-bit bus' },
    { mhz: 390.625, note: '25 Gb/s Ethernet, 64-bit bus' },
  ];

  const EPS = 1e-9;

  // cuts[k] = 1 puts a register after ops[k] (k = 0..5)
  function evaluate(cuts, mhz) {
    const period = 1000 / mhz;
    const stages = [];
    let cur = { from: 0, to: 0, logic: 0 };
    ops.forEach((op, k) => {
      cur.logic += op.delay;
      cur.to = k;
      if (k === ops.length - 1 || cuts[k]) {
        stages.push(cur);
        cur = { from: k + 1, to: k + 1, logic: 0 };
      }
    });
    for (const s of stages) {
      s.logic = Math.round(s.logic * 1000) / 1000;
      s.total = s.logic + REG;
      s.slack = period - s.total;
      s.met = s.slack >= -EPS;
    }
    const wns = Math.min(...stages.map((s) => s.slack));
    const worst = Math.max(...stages.map((s) => s.total));
    const flops = IO_FLOPS + cuts.reduce((a, c, k) => a + (c ? ops[k].bits : 0), 0);
    return {
      mhz,
      period,
      stages,
      cuts: cuts.map((c) => (c ? 1 : 0)),
      met: wns >= -EPS,
      wns,
      latency: stages.length * period,
      flops,
      fmax: 1000 / worst,
    };
  }

  // Fewest stages that meet timing; ties broken by fewest flip-flops.
  function best(mhz) {
    let top = null;
    const n = ops.length - 1;
    for (let m = 0; m < 1 << n; m++) {
      const cuts = Array.from({ length: n }, (_, k) => (m >> k) & 1);
      const r = evaluate(cuts, mhz);
      if (!r.met) continue;
      if (!top || r.stages.length < top.stages.length || (r.stages.length === top.stages.length && r.flops < top.flops)) top = r;
    }
    return top;
  }

  function report(r) {
    const f3 = (x) => (x >= 0 ? '+' : '') + x.toFixed(3);
    const lines = [];
    const rule = '─'.repeat(62);
    lines.push(`clock ${r.mhz} MHz   period ${r.period.toFixed(3)} ns`);
    lines.push(`register overhead ${REG.toFixed(3)} ns per stage (clock-to-out + setup)`);
    lines.push(rule);
    r.stages.forEach((s, k) => {
      const path = ops.slice(s.from, s.to + 1).map((o) => o.name).join(' → ');
      lines.push(
        `stage ${k + 1}  ${s.logic.toFixed(3)} + ${REG.toFixed(3)} = ${s.total.toFixed(3).padStart(6)} ns   slack ${f3(s.slack).padStart(7)}  ${s.met ? 'met' : 'VIOLATED'}`
      );
      lines.push(`         ${path}`);
    });
    lines.push(rule);
    lines.push(`worst negative slack  ${f3(r.wns)} ns   timing ${r.met ? 'MET' : 'FAILED'}`);
    lines.push(`latency               ${r.met ? `${r.stages.length} × ${r.period.toFixed(3)} ns = ${r.latency.toFixed(1)} ns` : 'meaningless until timing is met'}`);
    lines.push(`flip-flops            ${r.flops} (in/out ${IO_FLOPS} + pipeline ${r.flops - IO_FLOPS})`);
    lines.push(`fastest clock         ${r.fmax.toFixed(1)} MHz`);
    return lines;
  }

  LAB.Timing = { ops, REG, IO_FLOPS, clocks, evaluate, best, report };
})((globalThis.LAB = globalThis.LAB || {}));
