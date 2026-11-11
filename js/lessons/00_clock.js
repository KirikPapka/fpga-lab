/* Lesson 0: clock and register. */
(function (LAB) {
  'use strict';
  const { UI } = LAB;
  const st = { en: 1, d_in: 0 };

  LAB.lessons.push({
    title: 'clock and register',
    about: `
<p>An FPGA is a chip of a few hundred thousand small logic blocks and flip-flops that you wire together by writing code. Trading firms use them because the wiring <em>is</em> the program: nothing waits for an operating system, a cache or a queue.</p>
<p>Software runs one line after another. Hardware does not. On every rising edge of the clock, every flip-flop (a <code>reg</code>) loads its new value at the same instant. Between edges, plain logic works out what those next values will be.</p>
<p>Here a counter adds one on each edge, and two registers form a chain: <code>a</code> copies <code>d_in</code>, and <code>b</code> copies <code>a</code>.</p>`,
    tryThis: [
      'Turn on <code>d_in</code> and step. <code>a</code> picks it up on the next edge, <code>b</code> one edge later, even though both lines run at once.',
      'Read the line <code>b &lt;= a</code>: it uses the <em>old</em> <code>a</code>. Swapping the two lines would change nothing, because order inside the block does not matter.',
      'Turn off <code>en</code>: the counter holds its value.',
      'Click any cycle in the waveform, or press ← →, to look back in time.',
    ],
    simplified: `<p>The clock is labelled 156.25 MHz (6.4 ns per cycle), the clock of a 10 Gb/s Ethernet port. Real designs must also make sure signals settle between edges; lesson 4 is about that.</p>`,

    mount(ctx) {
      st.en = 1;
      st.d_in = 0;
      const after = (view, s) => {
        const nx = view.sim.history[s.cycle + 1];
        return nx ? { count: nx.count, a: nx.a, b: nx.b } : view.sim.regs.c;
      };
      this.view = new LAB.SimView(ctx, {
        design: () => LAB.designs.clock(),
        inputs: (c) => ({ rst: c < 1 ? 1 : 0, en: st.en, d_in: st.d_in }),
        cellW: 48,
        signals: () => [
          { key: 'clk', label: 'clk' },
          { key: 'rst', label: 'rst', bits: 1 },
          { key: 'en', label: 'en', bits: 1 },
          { key: 'd_in', label: 'd_in', bits: 1 },
          { key: 'count', label: 'count', bits: 4, fmt: (v) => String(v) },
          { key: 'a', label: 'a', bits: 1 },
          { key: 'b', label: 'b', bits: 1 },
        ],
        strip: [
          { label: 'd_in', sub: (s) => String(s.d_in), active: (s) => s.d_in, code: 'clock' },
          { label: 'reg a', sub: (s) => String(s.a), active: (s) => s.a, code: 'clock' },
          { label: 'reg b', sub: (s) => String(s.b), active: (s) => s.b, code: 'clock' },
          { gap: true, label: 'reg count', sub: (s) => `${s.count}  (+${s.en ? 1 : 0})`, active: (s) => s.en, code: 'clock' },
        ],
        codeTags: ['clock'],
        codeDefault: 'clock',
        values: (s, prev, view) => {
          const nx = after(view, s);
          const ch = (k) => (nx[k] !== s[k] ? ' class="ch"' : '');
          return `
<h3>registers at cycle ${s.cycle} and after the next edge</h3>
<table class="kv">
  <tr><th>reg</th><th>now</th><th>after edge</th><th>because</th></tr>
  <tr><td>count</td><td>${s.count}</td><td${ch('count')}>${nx.count}</td><td class="dim">${s.rst ? 'rst' : s.en ? 'count + 1' : 'en is 0: hold'}</td></tr>
  <tr><td>a</td><td>${s.a}</td><td${ch('a')}>${nx.a}</td><td class="dim">${s.rst ? 'rst' : 'd_in was ' + s.d_in}</td></tr>
  <tr><td>b</td><td>${s.b}</td><td${ch('b')}>${nx.b}</td><td class="dim">${s.rst ? 'rst' : 'old a was ' + s.a}</td></tr>
</table>
<p class="hint">Inputs you change apply from the next cycle you step into.</p>`;
        },
        status: (s) => status([`cycle ${s.cycle}`, `clock 156.25 MHz · 6.4 ns per cycle`, `${(s.cycle * LAB.PERIOD_NS).toFixed(1)} ns since power-up`]),
      });
      ctx.controls.append(
        UI.row(
          UI.toggle('en (count enable)', st.en, (x) => (st.en = x ? 1 : 0)),
          UI.toggle('d_in', st.d_in, (x) => (st.d_in = x ? 1 : 0))
        ),
        this.view.basicControls()
      );
    },
  });

  const status = (parts) => LAB.statusLine(parts);
})(globalThis.LAB);
