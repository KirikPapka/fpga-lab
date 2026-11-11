#!/usr/bin/env node
/* fpga-lab tests.
 *
 *   node test/run_tests.js
 *
 * 1. Unit tests on the JavaScript models (golden vectors).
 * 2. Writes rtl/*.v from js/verilog.js (the exact text the page shows).
 * 3. If Icarus Verilog is installed, simulates that Verilog on thousands of
 *    cycles of the same seeded feed and checks it matches the JavaScript
 *    models signal for signal, cycle for cycle.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
for (const f of ['sim.js', 'feed.js', 'modules.js', 'verilog.js', 'timing.js', 'race.js']) {
  const p = path.join(ROOT, 'js', f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
const LAB = globalThis.LAB;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const note = fn();
    passed++;
    console.log(`  ok    ${name}${note ? '  (' + note + ')' : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
function eq(actual, expected, what = '') {
  if (actual !== expected) throw new Error(`${what} expected ${expected}, got ${actual}`);
}
function ok(cond, what) {
  if (!cond) throw new Error(what);
}

// Runs the tick-to-trade pipeline; inputs(c) may override the defaults per cycle.
function runPipeline(width, cycles, opts = {}) {
  const sim = new LAB.Sim(LAB.designs.pipeline(width));
  const feed = new LAB.Feed.Source({ width, seed: opts.seed ?? 7, auto: opts.auto ?? true });
  if (opts.queue) feed.queue = opts.queue;
  const inputs = [];
  for (let c = 0; c < cycles; c++) {
    const ctl = { rst: c < 1 ? 1 : 0, armed: opts.armed ?? 1, threshold: opts.threshold ?? 3 };
    if (opts.control) Object.assign(ctl, opts.control(c));
    const f = ctl.rst ? feed.idleInputs() : feed.next(c);
    const i = Object.assign(ctl, f);
    inputs.push(i);
    sim.step(i);
  }
  return { sim, feed, inputs, h: sim.history };
}
const q = (inst, side, price, size, gap = 0) => ({ type: 0x51, inst, side, price, size, gap });
const { LEAD, TGT, BID, ASK } = LAB.Feed;

console.log('\nkernel');
test('registers commit together: a <= b; b <= a swaps them', () => {
  const sim = new LAB.Sim({
    init: () => ({ a: 1, b: 0 }),
    eval: (r) => ({ a: r.a, b: r.b }),
    next: (r) => ({ a: r.b, b: r.a }),
  });
  sim.step({});
  sim.step({});
  eq(sim.history[1].a, 0, 'a in cycle 1');
  eq(sim.history[1].b, 1, 'b in cycle 1');
  eq(sim.regs.a, 1, 'a after two edges');
});

test('clock_demo: b gets the old a, one cycle later', () => {
  const sim = new LAB.Sim(LAB.designs.clock());
  [
    { rst: 1, en: 0, d_in: 0 },
    { rst: 0, en: 1, d_in: 1 },
    { rst: 0, en: 1, d_in: 0 },
    { rst: 0, en: 1, d_in: 0 },
    { rst: 0, en: 0, d_in: 0 },
  ].forEach((i) => sim.step(i));
  const h = sim.history;
  eq(h[2].a, 1, 'a in cycle 2');
  eq(h[2].b, 0, 'b in cycle 2');
  eq(h[3].a, 0, 'a in cycle 3');
  eq(h[3].b, 1, 'b in cycle 3');
  eq(h[4].count, 3, 'count after three enabled edges');
});

console.log('\nparser');
test('8-bit: quote decoded 8 cycles after its first byte', () => {
  const { h } = runPipeline(8, 14, { auto: false, queue: [q(TGT, ASK, 10002, 300)] });
  const valid = h.filter((s) => s.msg_valid).map((s) => s.cycle);
  eq(valid.join(), '9', 'msg_valid cycles');
  eq(h[9].msg_inst, TGT, 'inst');
  eq(h[9].msg_side, 1, 'side');
  eq(h[9].msg_price, 10002, 'price');
  eq(h[9].msg_size, 300, 'size');
});

test('8-bit: trade prints are parsed but not passed on', () => {
  const trade = { type: 0x54, inst: TGT, side: BID, price: 10000, size: 100, gap: 0 };
  const { h } = runPipeline(8, 14, { auto: false, queue: [trade] });
  eq(h.filter((s) => s.msg_valid).length, 0, 'msg_valid pulses');
});

test('64-bit: quote decoded 1 cycle after it arrives', () => {
  const { h } = runPipeline(64, 5, { auto: false, queue: [q(LEAD, BID, 10005, 50)] });
  eq(h.filter((s) => s.msg_valid).map((s) => s.cycle).join(), '2', 'msg_valid cycles');
  eq(h[2].msg_price, 10005, 'price');
});

console.log('\nbook, trigger, order');
const orders = (h) => h.filter((s) => s._xsop);

test('scripted jump fires one buy at the stale ask, 11 cycles tick-to-trade', () => {
  const { h, feed } = runPipeline(8, 75, { auto: false });
  const o = orders(h);
  eq(o.length, 1, 'orders');
  eq(o[0]._xord.side, 0, 'side (0 = buy)');
  eq(o[0]._xord.price, 10002, 'price');
  eq(o[0]._xord.size, 300, 'size');
  eq(o[0].cycle - feed.starts[o[0]._xtag], 11, 'latency in cycles');
  const bytes = h.slice(o[0].cycle, o[0].cycle + 8).map((s) => LAB.fmt.hex(s.out_data, 8)).join(' ');
  eq(bytes, '4f 02 42 00 27 12 01 2c', 'order bytes');
});

test('64-bit bus: same order, 4 cycles tick-to-trade', () => {
  const { h, feed } = runPipeline(64, 30, { auto: false });
  const o = orders(h);
  eq(o.length, 1, 'orders');
  eq(o[0].cycle - feed.starts[o[0]._xtag], 4, 'latency in cycles');
  eq(LAB.fmt.hex(o[0].out_data, 64), '4f0242002712012c', 'order word');
});

test('threshold 6 ignores the 5-tick jump', () => {
  const { h } = runPipeline(8, 75, { auto: false, threshold: 6 });
  eq(orders(h).length, 0, 'orders');
});

test('disarmed: no orders in 3000 cycles; armed: several', () => {
  const off = runPipeline(8, 3000, { armed: 0 });
  const on = runPipeline(8, 3000, { armed: 1 });
  eq(orders(off.h).length, 0, 'orders while disarmed');
  const n = orders(on.h).length;
  ok(n >= 3, `expected several orders while armed, got ${n}`);
  return `${n} orders`;
});

test('one order per opportunity, not one per cycle', () => {
  const { h } = runPipeline(64, 3000, {});
  let rises = 0;
  for (let c = 1; c < h.length; c++) if (h[c].opp && !h[c - 1].opp && h[c].armed) rises++;
  const n = orders(h).length;
  ok(Math.abs(n - rises) <= 1, `orders ${n} vs opportunity starts ${rises}`);
  return `${n} orders`;
});

console.log('\nverilog text');
test('every tag the models report exists in the shown Verilog', () => {
  const seen = {};
  const collect = (design, h) =>
    h.forEach((s) =>
      design.verilog.forEach((v) => {
        (seen[v.name] = seen[v.name] || new Set());
        (s._tags[v.tags] || []).forEach((t) => seen[v.name].add(t));
      })
    );
  for (const w of [8, 64]) collect(LAB.designs.pipeline(w), runPipeline(w, 2000).h);
  const clock = new LAB.Sim(LAB.designs.clock());
  for (let c = 0; c < 20; c++) clock.step({ rst: c === 0 ? 1 : 0, en: c % 3 ? 1 : 0, d_in: c % 2 });
  collect(LAB.designs.clock(), clock.history);
  for (const [name, tags] of Object.entries(seen)) {
    const have = new Set(LAB.Verilog.parse(name).lines.flatMap((l) => l.tags));
    for (const t of tags) ok(have.has(t), `${name}: tag ${t} not found`);
  }
});

test('exported text has no tag markers', () => {
  for (const name of LAB.Verilog.names()) ok(!LAB.Verilog.plain(name).includes('//@'), name);
});

if (LAB.Timing) {
  console.log('\ntiming puzzle');
  test('par at 156.25 MHz: 2 stages, 12.8 ns, cut after the edge calculation', () => {
    const best = LAB.Timing.best(156.25);
    eq(best.stages.length, 2, 'stages');
    eq(best.latency.toFixed(1), '12.8', 'latency');
    eq(best.cuts.map((c) => (c ? 1 : 0)).join(''), '000100', 'cut position');
    return `${best.flops} flip-flops`;
  });
  test('no registers at 156.25 MHz fails timing', () => {
    eq(LAB.Timing.evaluate([0, 0, 0, 0, 0, 0], 156.25).met, false, 'met');
  });
  test('every clock has a design that meets timing', () => {
    for (const c of LAB.Timing.clocks) ok(LAB.Timing.best(c.mhz).met, c.mhz + ' MHz');
  });
}

if (LAB.Race) {
  console.log('\nrace');
  test('default race: you beat a slightly slower rival most of the time', () => {
    const r = LAB.Race.run(LAB.Race.defaults());
    const you = r.players[0].share;
    ok(you > 0.7 && you < 0.9, `your win share ${you}`);
    eq(r.players[2].wins, 0, 'software wins');
    return `you ${(you * 100).toFixed(0)}%`;
  });
  test('one extra metre of cable flips the race', () => {
    const r = LAB.Race.run(Object.assign(LAB.Race.defaults(), { cable: 1 }));
    ok(r.players[0].share < 0.3, `your win share ${r.players[0].share}`);
  });
}

// ---------------------------------------------------------------- Verilog
const RTL = path.join(ROOT, 'rtl');
const OUT = path.join(ROOT, 'test', 'out');
fs.mkdirSync(RTL, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
for (const name of LAB.Verilog.names()) fs.writeFileSync(path.join(RTL, name + '.v'), LAB.Verilog.plain(name));

function which(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Testbench: drive inputs from a vector file, print probes once per cycle before the edge.
function makeTB({ top, n, inputs, outputs, probes, vecPath }) {
  const range = (b) => (b > 1 ? `[${b - 1}:0] ` : '');
  const bits = (p) => (p.bits > 1 ? `v[${p.lo + p.bits - 1}:${p.lo}]` : `v[${p.lo}]`);
  return `module tb;
  reg clk = 1'b0;
${inputs.map((p) => `  reg ${range(p.bits)}${p.name} = 0;`).join('\n')}
${outputs.map((p) => `  wire ${range(p.bits)}${p.name};`).join('\n')}
  reg [95:0] vec [0:${n - 1}];
  reg [95:0] v;
  integer cyc;

  ${top} dut (.clk(clk), ${[...inputs, ...outputs].map((p) => `.${p.name}(${p.name})`).join(', ')});

  initial begin
    $readmemh("${vecPath}", vec);
    for (cyc = 0; cyc < ${n}; cyc = cyc + 1) begin
      v = vec[cyc];
${inputs.map((p) => `      ${p.name} = ${bits(p)};`).join('\n')}
      #2;
      $display("%0d ${probes.map(() => '%h').join(' ')}", cyc, ${probes.map((p) => 'dut.' + p[0]).join(', ')});
      #3 clk = 1'b1;
      #5 clk = 1'b0;
    end
    $finish;
  end
endmodule
`;
}

function crossCheck({ label, top, files, inputs, outputs, probes, steps }) {
  const vecPath = path.join(OUT, `${top}_vectors.hex`);
  const tbPath = path.join(OUT, `${top}_tb.v`);
  const vvpPath = path.join(OUT, `${top}.vvp`);
  fs.writeFileSync(vecPath, steps.vectors.join('\n') + '\n');
  fs.writeFileSync(tbPath, makeTB({ top, n: steps.vectors.length, inputs, outputs, probes, vecPath }));
  execFileSync('iverilog', ['-g2005', '-Wall', '-o', vvpPath, tbPath, ...files.map((f) => path.join(RTL, f + '.v'))], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const vlines = execFileSync('vvp', ['-n', vvpPath], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => /^\d+ /.test(l));
  const jlines = steps.history.map((s) => `${s.cycle} ${probes.map((p) => LAB.fmt.hex(s[p[1]], p[2])).join(' ')}`);
  fs.writeFileSync(path.join(OUT, `${top}_verilog.txt`), vlines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, `${top}_js.txt`), jlines.join('\n') + '\n');
  eq(vlines.length, jlines.length, `${label}: cycles printed`);
  let compared = 0;
  for (let c = 0; c < jlines.length; c++) {
    const vt = vlines[c].split(' ');
    const jt = jlines[c].split(' ');
    for (let k = 1; k < vt.length; k++) {
      if (/[xz]/i.test(vt[k])) continue; // not yet driven in hardware: don't care
      if (vt[k] !== jt[k]) {
        throw new Error(`${label}: cycle ${c}, ${probes[k - 1][0]}: verilog ${vt[k]}, js ${jt[k]}`);
      }
      compared++;
    }
  }
  return compared;
}

console.log('\nverilog cross-check');
if (!which('iverilog') || !which('vvp')) {
  console.log('  skip  Icarus Verilog not installed (brew install icarus-verilog)');
} else {
  const pack = (fields) => fields.reduce((acc, [val, lo]) => acc | (BigInt(val) << BigInt(lo)), 0n).toString(16).padStart(24, '0');

  test('clock_demo matches Icarus Verilog', () => {
    const sim = new LAB.Sim(LAB.designs.clock());
    const rand = LAB.Feed.rng(3);
    const vectors = [];
    for (let c = 0; c < 400; c++) {
      const i = { rst: c < 1 || (c > 200 && c < 203) ? 1 : 0, en: rand() < 0.7 ? 1 : 0, d_in: rand() < 0.5 ? 1 : 0 };
      vectors.push(pack([[i.rst, 2], [i.en, 1], [i.d_in, 0]]));
      sim.step(i);
    }
    const n = crossCheck({
      label: 'clock_demo',
      top: 'clock_demo',
      files: ['clock_demo'],
      inputs: [{ name: 'rst', bits: 1, lo: 2 }, { name: 'en', bits: 1, lo: 1 }, { name: 'd_in', bits: 1, lo: 0 }],
      outputs: [{ name: 'count', bits: 4 }, { name: 'a', bits: 1 }, { name: 'b', bits: 1 }],
      probes: LAB.designs.probes.clock(),
      steps: { vectors, history: sim.history },
    });
    return `${n} values over 400 cycles`;
  });

  for (const width of [8, 64]) {
    test(`tick_to_trade (${width}-bit bus) matches Icarus Verilog`, () => {
      const N = 6000;
      const control = (c) => ({
        rst: c < 1 || (c >= 3000 && c < 3002) ? 1 : 0,
        armed: c >= 1500 && c < 1900 ? 0 : 1,
        threshold: c < 2400 ? 3 : c < 4200 ? 1 : 5,
      });
      const run = runPipeline(width, N, { seed: 11, control });
      const vectors = run.inputs.map((i) =>
        pack([[i.rst, 82], [i.in_valid, 81], [i.armed, 80], [i.threshold, 64], [i.in_data, 0]])
      );
      const top = width === 8 ? 'tick_to_trade' : 'tick_to_trade64';
      const files = width === 8
        ? ['feed_parser', 'top_of_book', 'trigger', 'order_tx', 'tick_to_trade']
        : ['feed_parser64', 'top_of_book', 'trigger', 'order_tx64', 'tick_to_trade64'];
      const n = crossCheck({
        label: top,
        top,
        files,
        inputs: [
          { name: 'rst', bits: 1, lo: 82 },
          { name: 'in_valid', bits: 1, lo: 81 },
          { name: 'armed', bits: 1, lo: 80 },
          { name: 'threshold', bits: 16, lo: 64 },
          { name: 'in_data', bits: width, lo: 0 },
        ],
        outputs: [{ name: 'out_valid', bits: 1 }, { name: 'out_data', bits: width }],
        probes: LAB.designs.probes.pipeline(width),
        steps: { vectors, history: run.h },
      });
      return `${n} values over ${N} cycles, ${orders(run.h).length} orders`;
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
