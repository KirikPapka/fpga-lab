/* fpga-lab: waveform viewer on a canvas.
 *
 * Signals are rows: { key, label, bits, fmt?(v, snap), short?(v, snap) }.
 * key 'clk' draws the clock. One-bit rows draw high/low lines; wider rows draw
 * bus segments with the value written in when it fits.
 */
(function (LAB) {
  'use strict';

  const LABEL_W = 108;
  const ROW_H = 20;
  const HEAD_H = 18;
  const CELL_W = 30;

  function theme(el) {
    const cs = getComputedStyle(el);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      bg: v('--bg'),
      rule: v('--rule'),
      faint: v('--faint'),
      text: v('--text'),
      dim: v('--dim'),
      accent: v('--accent'),
      accentBg: v('--accent-bg'),
      second: v('--second'),
      font: v('--mono'),
    };
  }

  function cellsFor(width, cw = CELL_W) {
    return Math.max(6, Math.floor((width - LABEL_W - 4) / cw));
  }

  function heightFor(rows) {
    return HEAD_H + rows * ROW_H + 6;
  }

  function valueText(sig, v, snap) {
    if (sig.fmt) return sig.fmt(v, snap);
    return LAB.fmt.hex(v, sig.bits);
  }

  // view: { history, cursor, start, signals }
  function draw(canvas, view) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = heightFor(view.signals.length);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = H + 'px';
    }
    const g = canvas.getContext('2d');
    const t = theme(canvas);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = `11px ${t.font}`;
    g.textBaseline = 'middle';

    const CW = view.cellW || CELL_W;
    const n = cellsFor(W, CW);
    const start = view.start;
    const hist = view.history;
    const x0 = LABEL_W;
    const xc = (c) => x0 + (c - start) * CW;

    // cursor column
    if (view.cursor >= start && view.cursor < start + n) {
      g.fillStyle = t.accentBg;
      g.fillRect(xc(view.cursor), 0, CW, H);
    }

    // grid and cycle numbers
    g.strokeStyle = t.rule;
    g.lineWidth = 1;
    g.fillStyle = t.dim;
    g.textAlign = 'left';
    for (let k = 0; k <= n; k++) {
      const c = start + k;
      const x = Math.round(xc(c)) + 0.5;
      g.beginPath();
      g.moveTo(x, HEAD_H - 4);
      g.lineTo(x, H);
      g.stroke();
      if (k < n && (c % 5 === 0 || c === view.cursor)) {
        g.fillStyle = c === view.cursor ? t.accent : t.dim;
        g.fillText(String(c), x + 3, HEAD_H / 2);
      }
    }

    view.signals.forEach((sig, row) => {
      const yTop = HEAD_H + row * ROW_H;
      const yHi = yTop + 4;
      const yLo = yTop + ROW_H - 4;
      const yMid = yTop + ROW_H / 2;

      g.fillStyle = sig.key === 'clk' ? t.dim : t.text;
      g.textAlign = 'left';
      g.fillText(sig.label || sig.key, 8, yMid);
      g.strokeStyle = t.rule;
      g.beginPath();
      g.moveTo(0, yTop + ROW_H + 0.5);
      g.lineTo(W, yTop + ROW_H + 0.5);
      g.stroke();

      const end = Math.min(start + n, hist.length);
      if (end <= start) return;

      if (sig.key === 'clk') {
        g.strokeStyle = t.dim;
        g.beginPath();
        for (let c = start; c < end; c++) {
          const x = xc(c);
          g.moveTo(x, yLo);
          g.lineTo(x, yHi);
          g.lineTo(x + CW / 2, yHi);
          g.lineTo(x + CW / 2, yLo);
          g.lineTo(x + CW, yLo);
        }
        g.stroke();
        return;
      }

      if (sig.bits === 1 && !sig.bus) {
        g.lineWidth = 1.5;
        for (let c = start; c < end; c++) {
          const v = hist[c][sig.key] ? 1 : 0;
          const prev = c > 0 ? (hist[c - 1][sig.key] ? 1 : 0) : v;
          const x = xc(c);
          g.strokeStyle = v ? t.accent : t.faint;
          g.beginPath();
          if (prev !== v && c > start) {
            g.moveTo(x, prev ? yHi : yLo);
            g.lineTo(x, v ? yHi : yLo);
          } else {
            g.moveTo(x, v ? yHi : yLo);
          }
          g.lineTo(x + CW, v ? yHi : yLo);
          g.stroke();
          if (v) {
            g.fillStyle = t.accentBg;
            g.fillRect(x, yHi, CW, yLo - yHi);
          }
        }
        g.lineWidth = 1;
        return;
      }

      // bus: group runs of equal value
      let c = start;
      while (c < end) {
        const v = hist[c][sig.key];
        const text = valueText(sig, v, hist[c]);
        let e = c + 1;
        while (e < end && hist[e][sig.key] === v && valueText(sig, v, hist[e]) === text) e++;
        const xa = xc(c);
        const xb = xc(e);
        const idle = text === '' || text === '—';
        const changed = view.cursor >= c && view.cursor < e && c > 0 && hist[c - 1][sig.key] !== v;
        g.strokeStyle = idle ? t.faint : changed ? t.accent : t.second;
        g.beginPath();
        if (idle) {
          g.moveTo(xa + 2, yMid);
          g.lineTo(xb - 2, yMid);
        } else {
          const s = 3;
          g.moveTo(xa + s, yHi);
          g.lineTo(xb - s, yHi);
          g.lineTo(xb, yMid);
          g.lineTo(xb - s, yLo);
          g.lineTo(xa + s, yLo);
          g.lineTo(xa, yMid);
          g.closePath();
        }
        g.stroke();
        if (!idle) {
          const room = xb - xa - 8;
          let label = text;
          if (g.measureText(label).width > room && sig.short) label = sig.short(v, hist[c]);
          if (g.measureText(label).width <= room) {
            g.fillStyle = changed ? t.accent : t.text;
            g.textAlign = 'center';
            g.fillText(label, (xa + xb) / 2, yMid + 0.5);
          }
        }
        c = e;
      }
    });

    // label column backdrop line
    g.strokeStyle = t.rule;
    g.beginPath();
    g.moveTo(x0 - 0.5, 0);
    g.lineTo(x0 - 0.5, H);
    g.stroke();
  }

  function cycleAt(canvas, view, clientX) {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left - LABEL_W;
    if (x < 0) return null;
    return view.start + Math.floor(x / (view.cellW || CELL_W));
  }

  LAB.Wave = { draw, cellsFor, heightFor, cycleAt };
})((globalThis.LAB = globalThis.LAB || {}));
