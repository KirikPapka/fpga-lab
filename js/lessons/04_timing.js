/* Lesson 4: meet timing by placing pipeline registers. */
(function (LAB) {
  'use strict';
  const { UI, Timing } = LAB;
  const st = { cuts: [0, 0, 0, 0, 0, 0], mhz: 156.25, par: false };

  const ROW = 30;
  const TOP = 26;
  const AXIS = 26;
  const PAD_L = 74;
  const PAD_R = 24;

  function theme(el) {
    const cs = getComputedStyle(el);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      rule: v('--rule'), rule2: v('--rule-2'), faint: v('--faint'), text: v('--text'), dim: v('--dim'), bright: v('--bright'),
      accent: v('--accent'), accentBg: v('--accent-bg'), second: v('--second'), bad: v('--bad'), badBg: v('--bad-bg'),
      bg3: v('--bg-3'), font: v('--mono'),
    };
  }

  // Layout in nanoseconds: stage k starts at clock edge k and runs its operations back to back.
  function layout(r) {
    const P = r.period;
    const items = [];
    r.stages.forEach((s, k) => {
      let t = k * P;
      for (let j = s.from; j <= s.to; j++) {
        items.push({ kind: 'op', j, stage: k, t0: t, t1: t + Timing.ops[j].delay });
        t += Timing.ops[j].delay;
      }
      items.push({ kind: 'reg', j: s.to, stage: k, t0: t, t1: t + Timing.REG, last: k === r.stages.length - 1 });
    });
    const extent = Math.max(r.stages.length * P, ...items.map((i) => i.t1)) + 0.2;
    return { items, extent };
  }

  function geometry(canvas, r) {
    const W = canvas.clientWidth;
    const { items, extent } = layout(r);
    const k = (W - PAD_L - PAD_R) / extent;
    const X = (ns) => PAD_L + ns * k;
    const rows = Math.max(3, r.stages.length);
    return { W, H: TOP + rows * ROW + AXIS, X, k, items, extent };
  }

  // Clickable spots: a gap between two ops in the same stage, or a pipeline register.
  function hits(geo) {
    const out = [];
    const { items, X } = geo;
    items.forEach((it, n) => {
      const y = TOP + it.stage * ROW;
      if (it.kind === 'op') {
        const nx = items[n + 1];
        if (nx && nx.kind === 'op' && it.j < Timing.ops.length - 1) {
          const x = X(it.t1);
          out.push({ j: it.j, x0: x - 7, x1: x + 7, y0: y, y1: y + ROW, add: true });
        }
      } else if (!it.last) {
        out.push({ j: it.j, x0: X(it.t0) - 4, x1: X(it.t1) + 4, y0: y, y1: y + ROW, add: false });
      }
    });
    return out;
  }

  function draw(canvas, r, hover) {
    const geo = geometry(canvas, r);
    const { W, H, X, items } = geo;
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
    const P = r.period;
    const rowsBottom = H - AXIS;

    // clock edges
    for (let e = 0; e <= r.stages.length; e++) {
      const x = Math.round(X(e * P)) + 0.5;
      g.strokeStyle = t.rule2;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(x, TOP - 6);
      g.lineTo(x, rowsBottom);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = t.dim;
      g.textAlign = 'center';
      g.fillText(e === 0 ? 'edge 0' : `edge ${e}`, x, 10);
    }

    // rows
    r.stages.forEach((s, k) => {
      const y = TOP + k * ROW;
      g.fillStyle = s.met ? t.dim : t.bad;
      g.textAlign = 'left';
      g.fillText(`stage ${k + 1}`, 8, y + ROW / 2);
      // the clock period this stage must fit in
      g.fillStyle = s.met ? t.accentBg : t.badBg;
      g.fillRect(X(k * P), y + 3, P * geo.k, ROW - 6);
      // overflow past the next edge
      if (!s.met) {
        g.fillStyle = t.badBg;
        g.fillRect(X((k + 1) * P), y + 3, (s.total - P) * geo.k, ROW - 6);
      }
      // slack label
      const end = X(k * P + s.total);
      g.fillStyle = s.met ? t.accent : t.bad;
      g.textAlign = s.met ? 'left' : 'left';
      const label = (s.slack >= 0 ? '+' : '−') + Math.abs(s.slack).toFixed(2) + ' ns';
      const lx = s.met ? end + 6 : end + 6;
      if (s.met && lx + g.measureText(label).width < X((k + 1) * P) - 2) g.fillText(label, lx, y + ROW / 2);
      else if (!s.met) g.fillText(label, lx, y + ROW / 2);
    });

    // ops and registers
    items.forEach((it) => {
      const y = TOP + it.stage * ROW + 6;
      const h = ROW - 12;
      const x0 = X(it.t0);
      const x1 = X(it.t1);
      const stage = r.stages[it.stage];
      if (it.kind === 'op') {
        const op = Timing.ops[it.j];
        const over = !stage.met && it.t1 > (it.stage + 1) * P + 1e-9;
        g.fillStyle = t.bg3;
        g.fillRect(x0 + 1, y, x1 - x0 - 2, h);
        g.strokeStyle = over ? t.bad : t.second;
        g.strokeRect(Math.round(x0 + 1) + 0.5, Math.round(y) + 0.5, Math.round(x1 - x0 - 2) - 1, h - 1);
        const full = `${op.name} ${op.delay.toFixed(1)}`;
        const room = x1 - x0 - 8;
        const txt = g.measureText(full).width <= room ? full : g.measureText(op.name).width <= room ? op.name : g.measureText(op.name.slice(0, 3)).width <= room ? op.name.slice(0, 3) : '';
        g.fillStyle = t.text;
        g.textAlign = 'center';
        g.fillText(txt, (x0 + x1) / 2, y + h / 2 + 0.5);
      } else {
        g.fillStyle = it.last ? t.faint : t.accent;
        g.fillRect(x0 + 1, y - 3, Math.max(3, x1 - x0 - 2), h + 6);
      }
    });

    // hover hint
    if (hover) {
      g.strokeStyle = hover.add ? t.accent : t.bad;
      g.lineWidth = 1.5;
      g.strokeRect(hover.x0 + 0.5, hover.y0 + 2.5, hover.x1 - hover.x0 - 1, ROW - 5);
      g.lineWidth = 1;
    }

    // axis
    g.strokeStyle = t.rule2;
    g.beginPath();
    g.moveTo(PAD_L, rowsBottom + 4.5);
    g.lineTo(W - PAD_R, rowsBottom + 4.5);
    g.stroke();
    g.fillStyle = t.dim;
    g.textAlign = 'center';
    const stepNs = geo.k > 50 ? 1 : geo.k > 25 ? 2 : 5;
    for (let ns = 0; ns <= geo.extent; ns += stepNs) {
      const x = Math.round(X(ns)) + 0.5;
      g.beginPath();
      g.moveTo(x, rowsBottom + 2);
      g.lineTo(x, rowsBottom + 7);
      g.stroke();
      g.fillText(ns + (ns === 0 ? ' ns' : ''), x, rowsBottom + 16);
    }
    return geo;
  }

  LAB.lessons.push({
    title: 'meet timing',
    kind: 'widget',
    about: `
<p>Logic is not instant. Each operation takes a fraction of a nanosecond for its signals to settle, and everything between two registers must settle within one clock period. If it doesn't, the next register captures a half-finished value: the design <em>fails timing</em> and the chip computes nonsense.</p>
<p>The fix is a pipeline register that cuts the path in two. But every register costs a whole clock cycle of latency. FPGA engineers in trading spend much of their week here: reading timing reports and moving registers one operation left or right.</p>
<p>Above is the path from parsed message to order, to scale in nanoseconds. Each row is one stage between two clock edges; the shaded box is the time it has. The green bar at the end of a stage is the register (it costs ${LAB.Timing.REG} ns too).</p>`,
    tryThis: [
      'At 156.25 MHz with no registers, the path overruns the clock period. Click a gap between two operations to add a register; click a green register to remove it.',
      'Find the fewest registers that meet timing. Then, among the designs that are equally fast, find the one with the fewest flip-flops: cut where the data is narrow.',
      'Switch to 390.625 MHz. Each stage is now shorter, so you need more registers. Is the total latency better or worse? Press <em>show par</em> to compare.',
    ],
    simplified: `<p>Delays are invented but realistic orders of magnitude. On a real chip, wiring between blocks often takes as long as the logic, and the vendor tools place and route the design for you, which takes minutes to hours per attempt. Here it takes a click.</p>`,

    mount(ctx) {
      const canvas = UI.el('canvas', { role: 'img', 'aria-label': 'Pipeline timing diagram: operations per stage against the clock period.' });
      ctx.stage.append(canvas);
      const title = UI.el('div', { class: 'pane-title' }, 'timing_report.txt');
      const pre = UI.el('pre', { class: 'report' });
      ctx.code.append(title, pre);
      let hover = null;
      let geo = null;

      const render = () => {
        const r = Timing.evaluate(st.cuts, st.mhz);
        geo = draw(canvas, r, hover);
        pre.innerHTML = Timing.report(r)
          .map((l) => (/VIOLATED|FAILED/.test(l) ? `<span class="bad">${l}</span>` : /\bMET\b/.test(l) ? `<span class="ch">${l}</span>` : l))
          .join('\n');
        const par = Timing.best(st.mhz);
        const p = (v) => (st.par ? v : '<span class="dim">?</span>');
        ctx.values.innerHTML = `
<h3>your design vs par</h3>
<table class="kv">
  <tr><th></th><th>yours</th><th>par</th></tr>
  <tr><td>timing</td><td class="${r.met ? 'ch' : 'bad'}">${r.met ? 'met' : 'failed'}</td><td>${p('met')}</td></tr>
  <tr><td>stages</td><td>${r.stages.length}</td><td>${p(par.stages.length)}</td></tr>
  <tr><td>latency</td><td>${r.met ? r.latency.toFixed(1) + ' ns' : '<span class="dim">— (fails)</span>'}</td><td>${p(par.latency.toFixed(1) + ' ns')}</td></tr>
  <tr><td>flip-flops</td><td>${r.flops}</td><td>${p(par.flops)}</td></tr>
</table>
${r.met && r.stages.length === par.stages.length && r.flops === par.flops ? '<p class="hint ch">You found par.</p>' : ''}
<h3>operations</h3>
<table class="kv">
  <tr><th>op</th><th class="num">delay</th><th class="num">bits after</th></tr>
  ${Timing.ops.map((o) => `<tr><td>${o.long}</td><td class="num">${o.delay.toFixed(1)} ns</td><td class="num">${o === Timing.ops[Timing.ops.length - 1] ? '—' : o.bits}</td></tr>`).join('')}
</table>`;
        ctx.status.innerHTML = LAB.statusLine([
          `clock ${st.mhz} MHz · ${r.period.toFixed(2)} ns`,
          `${r.stages.length} stage${r.stages.length === 1 ? '' : 's'}`,
          r.met ? `<b>latency ${r.latency.toFixed(1)} ns</b>` : 'latency —',
          `${r.flops} flip-flops`,
          r.met ? `<span class="ok">timing met (WNS +${r.wns.toFixed(2)} ns)</span>` : `<span class="bad">timing failed (WNS −${Math.abs(r.wns).toFixed(2)} ns)</span>`,
        ]);
        cutToggles.forEach((b, j) => b.set(st.cuts[j]));
      };

      canvas.addEventListener('mousemove', (e) => {
        if (!geo) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const h = hits(geo).find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) || null;
        canvas.style.cursor = h ? 'pointer' : 'default';
        if ((h && h.j) !== (hover && hover.j) || !!h !== !!hover) {
          hover = h;
          render();
        }
      });
      canvas.addEventListener('mouseleave', () => {
        hover = null;
        render();
      });
      canvas.addEventListener('click', () => {
        if (!hover) return;
        st.cuts[hover.j] = hover.add ? 1 : 0;
        hover = null;
        render();
      });

      const cutToggles = Timing.ops.slice(0, -1).map((op, j) =>
        UI.toggle(op.name, st.cuts[j], (x) => {
          st.cuts[j] = x ? 1 : 0;
          render();
        })
      );
      const parBtn = UI.button(st.par ? 'hide par' : 'show par', () => {
        st.par = !st.par;
        parBtn.firstChild.textContent = st.par ? 'hide par' : 'show par';
        render();
      });

      ctx.controls.append(
        UI.choice('clock', Timing.clocks.map((c) => ({ value: c.mhz, label: `${c.mhz}`, title: c.note })), st.mhz, (m) => {
          st.mhz = m;
          render();
        }),
        UI.note(`MHz. The clock comes from the network port: ${Timing.clocks.map((c) => `${c.mhz} = ${c.note}`).join('; ')}.`),
        UI.el('div', { class: 'ctl' }, UI.el('span', { class: 'lab' }, 'register after')),
        UI.row(...cutToggles),
        UI.row(
          UI.button('clear registers', () => {
            st.cuts = [0, 0, 0, 0, 0, 0];
            render();
          }),
          parBtn,
          UI.button('use par', () => {
            st.cuts = Timing.best(st.mhz).cuts.slice();
            render();
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
