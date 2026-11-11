/* fpga-lab: lesson 5 model. Three traders react to the same LEAD move and
 * race to take the same stale TGT quote; the first to arrive wins it.
 *
 * Arrival time = logic + fixed network I/O + cable + jitter.
 *   FPGA jitter: the message lands at a random point within a clock cycle,
 *   so it waits 0..1 period for the next edge. Otherwise fully repeatable.
 *   Software: lognormal around a median (caches, interrupts, the OS).
 */
(function (LAB) {
  'use strict';

  const IO_NS = 200; // transceivers + MAC in and out, same for everyone in the colocation
  const NS_PER_M = 5; // signal speed in fibre or copper is about 0.2 m per ns

  function defaults() {
    return { you: 25.6, cable: 0, rival: 28, swMedianUs: 5, swSigma: 0.5, period: 1000 / 156.25, events: 1000, seed: 42 };
  }

  function run(p) {
    const rand = LAB.Feed.rng(p.seed);
    const gauss = () => {
      let u = 0;
      while (u === 0) u = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const players = [
      { name: 'you', kind: 'fpga', base: p.you + IO_NS + p.cable * NS_PER_M },
      { name: 'rival', kind: 'fpga', base: p.rival + IO_NS },
      { name: 'software', kind: 'sw', base: IO_NS },
    ].map((pl) => Object.assign(pl, { times: new Float64Array(p.events), won: new Uint8Array(p.events), wins: 0 }));

    for (let e = 0; e < p.events; e++) {
      let best = Infinity;
      let winner = 0;
      players.forEach((pl, k) => {
        const t = pl.kind === 'fpga' ? pl.base + rand() * p.period : pl.base + p.swMedianUs * 1000 * Math.exp(p.swSigma * gauss());
        pl.times[e] = t;
        if (t < best) {
          best = t;
          winner = k;
        }
      });
      players[winner].wins++;
      players[winner].won[e] = 1;
    }

    for (const pl of players) {
      const s = Array.from(pl.times).sort((a, b) => a - b);
      const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
      pl.median = q(0.5);
      pl.p1 = q(0.01);
      pl.p99 = q(0.99);
      pl.share = pl.wins / p.events;
    }
    return { players, params: p };
  }

  LAB.Race = { IO_NS, NS_PER_M, defaults, run };
})((globalThis.LAB = globalThis.LAB || {}));
