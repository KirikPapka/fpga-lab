/* Lesson 5: the race for a stale quote. */
(function (LAB) {
  'use strict';
  const { UI, Race } = LAB;
  const st = Race.defaults();
  const SW_STEPS = [1, 2, 5, 10, 20, 50];

  function theme(el) {
    const cs = getComputedStyle(el);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      rule: v('--rule'), rule2: v('--rule-2'), faint: v('--faint'), text: v('--text'), dim: v('--dim'),
      accent: v('--accent'), second: v('--second'), font: v('--mono'),
    };
  }

  const jitter = (e) => (((e + 1) * 2654435761) >>> 0) / 4294967296;
  const LABEL_W = 92;
  const PAD_R = 20;

  function plot(g, t, o) {
    // o: { y, title, lanes:[{pl,color}], x(ns), ticks:[{ns,label}], laneH, W, events }
    const { y, laneH, W } = o;
    g.fillStyle = t.dim;
    g.textAlign = 'left';
    g.fillText(o.title, 8, y + 7);
    const top = y + 18;
    o.lanes.forEach((ln, k) => {
      const ly = top + k * laneH;
      g.strokeStyle = t.rule;
      g.beginPath();
      g.moveTo(0, ly + laneH + 0.5);
      g.lineTo(W, ly + laneH + 0.5);
      g.stroke();
      g.fillStyle = ln.color;
      g.textAlign = 'left';
      g.fillText(ln.pl.name, 8, ly + laneH / 2);
      const n = ln.pl.times.length;
      for (let e = 0; e < n; e++) {
        const x = o.x(ln.pl.times[e]);
        if (x < LABEL_W - 2 || x > W - PAD_R + 4) continue;
        const yy = ly + 4 + jitter(e * 3 + k) * (laneH - 8);
        g.fillStyle = ln.pl.won[e] ? ln.color : t.faint;
        g.fillRect(x - 1, yy - 1, 2, 2);
      }
      // median tick
      const xm = o.x(ln.pl.median);
      if (xm >= LABEL_W && xm <= W - PAD_R) {
        g.strokeStyle = ln.color;
        g.beginPath();
        g.moveTo(Math.round(xm) + 0.5, ly + 1);
        g.lineTo(Math.round(xm) + 0.5, ly + laneH - 1);
        g.stroke();
      }
    });
    const axisY = top + o.lanes.length * laneH + 4;
    g.strokeStyle = t.rule2;
    g.beginPath();
    g.moveTo(LABEL_W, axisY + 0.5);
    g.lineTo(W - PAD_R, axisY + 0.5);
    g.stroke();
    g.fillStyle = t.dim;
    g.textAlign = 'center';
    o.ticks.forEach((tk) => {
      const x = Math.round(o.x(tk.ns)) + 0.5;
      g.beginPath();
      g.moveTo(x, axisY);
      g.lineTo(x, axisY + (tk.label ? 5 : 3));
      g.stroke();
      if (tk.label) g.fillText(tk.label, x, axisY + 13);
    });
    return axisY + 20;
  }

  function draw(canvas, res) {
    const W = canvas.clientWidth;
    const H = 260;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = H + 'px';
    }
    const t = theme(canvas);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = `11px ${t.font}`;
    g.textBaseline = 'middle';
    const [you, rival, sw] = res.players;
    const colors = [t.accent, t.second, t.text];

    // all three, log scale 100 ns .. 100 µs
    const lo = Math.log10(100);
    const hi = Math.log10(1e5);
    const xLog = (ns) => LABEL_W + ((Math.log10(ns) - lo) / (hi - lo)) * (W - LABEL_W - PAD_R);
    const ticks = [];
    for (let d = 2; d <= 5; d++) {
      for (const m of [1, 2, 5]) {
        const ns = m * 10 ** d;
        if (ns > 1e5) break;
        ticks.push({ ns, label: m === 1 ? LAB.fmt.time(ns).replace('.0 ', ' ').replace('.00 ', ' ') : '' });
      }
    }
    const y2 = plot(g, t, {
      y: 4, title: 'arrival at the exchange, log scale', laneH: 22, W, x: xLog, ticks,
      lanes: [{ pl: you, color: colors[0] }, { pl: rival, color: colors[1] }, { pl: sw, color: colors[2] }],
    });

    // zoom on the two FPGAs, linear
    const a = Math.min(you.base, rival.base) - 1;
    const b = Math.max(you.base, rival.base) + res.params.period + 1;
    const xLin = (ns) => LABEL_W + ((ns - a) / (b - a)) * (W - LABEL_W - PAD_R);
    const span = b - a;
    const stepNs = span > 60 ? 10 : span > 25 ? 5 : span > 12 ? 2 : 1;
    const lin = [];
    for (let ns = Math.ceil(a / stepNs) * stepNs; ns <= b; ns += stepNs) lin.push({ ns, label: ns + ' ns' });
    plot(g, t, {
      y: y2 + 6, title: 'zoom: the two FPGAs, linear scale', laneH: 30, W, x: xLin, ticks: lin,
      lanes: [{ pl: you, color: colors[0] }, { pl: rival, color: colors[1] }],
    });
  }

  LAB.lessons.push({
    title: 'race',
    kind: 'widget',
    about: `
<p>You are not the only one watching LEAD. When it jumps, every fast firm sees it at the same moment and sends an order for the same stale TGT quote. The exchange fills whoever arrives first. Second place gets nothing.</p>
<p>So the goal is not to be fast but to be <em>faster than the next firm, every time</em>. Consistency matters as much as the average: an FPGA takes the same number of clock cycles every time, while software's delay varies with caches, interrupts and the operating system.</p>
<p>This runs 1,000 races. Each dot is one order arriving; bright dots won their race, dim dots lost.</p>`,
    tryThis: [
      'With the defaults you win about 80% against a rival FPGA that is 2.4 ns slower. Software, at a 5 µs median, never wins.',
      'Add 1 m of cable to your connection (about 5 ns). Your share collapses: that is why firms pay for the rack closest to the exchange.',
      'Use the 8-bit design from lesson 3 (70.4 ns). The rival now wins every race, even though 70 ns sounds fast.',
      'Why does a 2.4 ns edge not win every time? Each FPGA waits up to one clock cycle (6.4 ns) for its next clock edge, so the two clouds overlap.',
    ],
    simplified: `<p>Both FPGAs pay the same fixed ${Race.IO_NS} ns for network hardware, and the only FPGA jitter is where the message lands within a clock cycle. Real races also run through switches and exchange gateways, and a fill can depend on queue position, not only arrival time.</p>`,

    mount(ctx) {
      const canvas = UI.el('canvas', { role: 'img', 'aria-label': 'Arrival times of 1,000 orders from you, a rival FPGA and a software trader.' });
      ctx.stage.append(canvas);
      const title = UI.el('div', { class: 'pane-title' }, 'race_results.txt');
      const body = UI.el('div', { class: 'values' });
      ctx.code.append(title, body);

      const render = () => {
        const res = Race.run(st);
        draw(canvas, res);
        const [you, rival, sw] = res.players;
        const bar = (share, cls) => `<span class="bar-cell ${cls}" style="width:${Math.round(share * 90)}px"></span>`;
        const rowFor = (pl, cls) =>
          `<tr><td>${pl.name}</td><td class="num">${LAB.fmt.time(pl.median)}</td><td class="num">${LAB.fmt.time(pl.p99 - pl.p1)}</td><td class="num">${pl.wins}</td><td>${bar(pl.share, cls)} ${(pl.share * 100).toFixed(1)}%</td></tr>`;
        body.innerHTML = `
<h3>1,000 races</h3>
<table class="kv">
  <tr><th></th><th class="num">median</th><th class="num">p1–p99 spread</th><th class="num">wins</th><th>share</th></tr>
  ${rowFor(you, '')}${rowFor(rival, 'second')}${rowFor(sw, 'dim')}
</table>`;
        const edge = rival.base - you.base;
        ctx.values.innerHTML = `
<h3>your time, piece by piece</h3>
<table class="kv">
  <tr><td>logic (tick-to-trade)</td><td class="num">${st.you.toFixed(1)} ns</td></tr>
  <tr><td>network hardware</td><td class="num">${Race.IO_NS} ns</td></tr>
  <tr><td>extra cable</td><td class="num">${(st.cable * Race.NS_PER_M).toFixed(1)} ns</td></tr>
  <tr><td>wait for clock edge</td><td class="num">0–${st.period.toFixed(1)} ns</td></tr>
</table>
<h3>your edge over the rival</h3>
<p class="hint">${edge >= 0 ? '+' : '−'}${Math.abs(edge).toFixed(1)} ns = ${(Math.abs(edge) / st.period).toFixed(2)} clock cycles = ${(Math.abs(edge) / Race.NS_PER_M).toFixed(2)} m of cable${edge < 0 ? ' (behind)' : ''}</p>`;
        ctx.status.innerHTML = LAB.statusLine([
          '1,000 races',
          `<b>you ${(you.share * 100).toFixed(1)}%</b>`,
          `rival ${(rival.share * 100).toFixed(1)}%`,
          `software ${(sw.share * 100).toFixed(1)}%`,
          `seed ${st.seed}`,
        ]);
      };

      const youSlider = UI.slider('your logic', { min: 5, max: 120, step: 0.1, value: st.you, fmt: (v) => v.toFixed(1) + ' ns' }, (v) => {
        st.you = v;
        render();
      });
      const setYou = (v) => () => {
        st.you = v;
        youSlider.set(v);
        render();
      };
      const swK = Math.max(0, SW_STEPS.indexOf(st.swMedianUs));
      ctx.controls.append(
        youSlider,
        UI.row(UI.button('64-bit design · 25.6 ns', setYou(25.6)), UI.button('8-bit design · 70.4 ns', setYou(70.4))),
        UI.slider('extra cable', { min: 0, max: 5, step: 0.1, value: st.cable, fmt: (v) => `${v.toFixed(1)} m · ${(v * Race.NS_PER_M).toFixed(1)} ns` }, (v) => {
          st.cable = v;
          render();
        }),
        UI.slider('rival logic', { min: 5, max: 120, step: 0.1, value: st.rival, fmt: (v) => v.toFixed(1) + ' ns' }, (v) => {
          st.rival = v;
          render();
        }),
        UI.slider('software median', { min: 0, max: SW_STEPS.length - 1, step: 1, value: swK, fmt: (k) => SW_STEPS[k] + ' µs' }, (k) => {
          st.swMedianUs = SW_STEPS[k];
          render();
        }),
        UI.row(
          UI.button('new random seed', () => {
            st.seed = (st.seed * 1103515245 + 12345) % 100000;
            render();
          }),
          UI.button('reset', () => {
            Object.assign(st, Race.defaults());
            LAB.App.dom.controls.innerHTML = '';
            ctx.stage.innerHTML = '';
            ctx.code.innerHTML = '';
            this.unmount();
            this.mount(ctx);
          })
        )
      );

      this.ro = new ResizeObserver(() => render());
      this.ro.observe(ctx.stage);
      render();
    },

    unmount() {
      if (this.ro) this.ro.disconnect();
    },
  });
})(globalThis.LAB);
