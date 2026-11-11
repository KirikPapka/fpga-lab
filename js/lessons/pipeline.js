/* Shared setup for lessons 1-3: the same tick-to-trade design, shown a block
 * at a time. level 1 = parser, 2 = + book, 3 = + trigger and order out.
 */
(function (LAB) {
  'use strict';
  const { UI, fmt, Feed } = LAB;
  const st = LAB.state;
  const NS = LAB.PERIOD_NS;
  const cyc = (n) => `${n} cycle${n === 1 ? '' : 's'} = ${(n * NS).toFixed(1)} ns`;

  // ---------------------------------------------------------------- formatting
  const hx = (v, bits) => fmt.hex(v, bits);
  const dataFmt = (v, s) => {
    if (!s.in_valid) return '';
    if (typeof v !== 'bigint') return hx(v, 8);
    return hx(v, 64);
  };
  const dataShort = (v, s) => {
    if (!s.in_valid || typeof v !== 'bigint') return '';
    const b = Number((v >> 56n) & 0xffn);
    return fmt.ascii(b) || 'msg';
  };
  const outFmt = (v, s) => (s.out_valid ? (typeof v === 'bigint' ? hx(v, 64) : hx(v, 8)) : '');
  const outShort = (v, s) => (s.out_valid ? 'O' : '');
  const instFmt = (v) => (v ? fmt.inst(v) : '');
  const px = (v) => fmt.px(v);

  function signals(level, width) {
    const sig = [
      { key: 'clk', label: 'clk' },
      { key: 'in_valid', label: 'in_valid', bits: 1 },
      { key: 'in_data', label: 'in_data', bits: width, fmt: dataFmt, short: dataShort },
    ];
    if (level === 1 && width === 8) sig.push({ key: 'idx', label: 'idx', bits: 3, fmt: (v) => String(v) });
    sig.push({ key: 'msg_valid', label: 'msg_valid', bits: 1 });
    if (level <= 2) {
      sig.push(
        { key: 'msg_inst', label: 'msg_inst', bits: 8, fmt: instFmt },
        { key: 'msg_side', label: 'msg_side', bits: 1, bus: true, fmt: (v, s) => (s.msg_inst ? (v ? 'ask' : 'bid') : '') },
        { key: 'msg_price', label: 'msg_price', bits: 24, fmt: px }
      );
    }
    if (level === 1) sig.push({ key: 'msg_size', label: 'msg_size', bits: 16, fmt: (v) => (v ? String(v) : '') });
    if (level >= 2) {
      sig.push(
        { key: 'lead_bid', label: 'lead_bid', bits: 24, fmt: px },
        { key: 'lead_ask', label: 'lead_ask', bits: 24, fmt: px },
        { key: 'tgt_bid', label: 'tgt_bid', bits: 24, fmt: px },
        { key: 'tgt_ask', label: 'tgt_ask', bits: 24, fmt: px }
      );
    }
    if (level >= 3) {
      sig.push(
        { key: 'buy', label: 'buy', bits: 1 },
        { key: 'sell', label: 'sell', bits: 1 },
        { key: 'fire', label: 'fire', bits: 1 },
        { key: 'out_valid', label: 'out_valid', bits: 1 },
        { key: 'out_data', label: 'out_data', bits: width, fmt: outFmt, short: outShort }
      );
    }
    return sig;
  }

  function strip(level) {
    return [
      {
        label: 'feed',
        sub: (s) => (s.in_valid ? (st.width === 8 ? `byte ${s._pos}` : 'message') : 'idle'),
        active: (s) => s.in_valid,
      },
      {
        label: 'parse',
        sub: (s) => (s.msg_valid ? 'msg_valid' : st.width === 8 ? `idx ${s.idx}` : 'wait'),
        active: (s) => s.in_valid || s.msg_valid,
        code: 'parse',
      },
      {
        label: 'book',
        sub: (s) => `TGT ${px(s.tgt_bid)}/${px(s.tgt_ask)}`,
        active: (s) => s.msg_valid,
        code: level >= 2 ? 'book' : null,
        faint: level < 2,
      },
      {
        label: 'trigger',
        sub: (s) => (s.buy ? 'BUY' : s.sell ? 'SELL' : level >= 3 && !s.armed ? 'disarmed' : 'wait'),
        active: (s) => s.opp || s.fire,
        code: level >= 3 ? 'trigger' : null,
        faint: level < 3,
      },
      {
        label: 'order out',
        sub: (s) => (s.out_valid ? (st.width === 8 ? `0x${hx(s.out_data, 8)}` : 'order') : 'idle'),
        active: (s) => s.out_valid,
        code: level >= 3 ? 'tx' : null,
        faint: level < 3,
      },
      {
        label: 'exchange',
        sub: (s) => (s.out_valid ? 'receiving' : ''),
        active: (s) => s.out_valid,
        faint: level < 3,
      },
    ];
  }

  // ---------------------------------------------------------------- values pane
  function wireTable(s, view) {
    const feed = view.feed;
    let tag = s.in_valid ? s._tag : -1;
    if (tag < 0) {
      // last message that started at or before this cycle
      for (let t = feed.sent.length - 1; t >= 0; t--) if (feed.starts[t] <= s.cycle) { tag = t; break; }
    }
    const m = feed.sent[tag];
    if (!m) return '<h3>on the wire</h3><p class="hint">waiting for the first message…</p>';
    const pos = s.in_valid ? (st.width === 8 ? s._pos : 8) : 8;
    const done = st.width === 64 ? (s.in_valid ? -1 : 8) : s.in_valid ? s._pos : 8;
    const rows = m.bytes.map((b, k) => {
      const cls = st.width === 64 && s.in_valid ? 'ch' : k === pos ? 'ch' : k < done ? '' : 'dim';
      const ascii = k === 0 || k === 2 ? ` '${fmt.ascii(b)}'` : '';
      return `<tr class="${cls}"><td>${k}</td><td>${hx(b, 8)}${ascii}</td><td>${Feed.FIELDS[k]}</td></tr>`;
    });
    return `
<h3>on the wire · message #${m.tag}</h3>
<p class="msg">${Feed.describe(m)}</p>
<table class="kv"><tr><th>byte</th><th>hex</th><th>field</th></tr>${rows.join('')}</table>`;
  }

  function bookTable(s, prev) {
    const cell = (k, extra) => {
      const ch = prev && prev[k] !== s[k] ? ' class="ch"' : '';
      return `<td${ch}>${px(s[k])}${extra ? ` <span class="dim">×${extra}</span>` : ''}</td>`;
    };
    return `
<h3>top of book (registers)</h3>
<table class="kv">
  <tr><th></th><th>bid</th><th>ask</th></tr>
  <tr><th>LEAD</th>${cell('lead_bid')}${cell('lead_ask')}</tr>
  <tr><th>TGT</th>${cell('tgt_bid', s.tgt_bid_sz)}${cell('tgt_ask', s.tgt_ask_sz)}</tr>
</table>`;
  }

  function triggerTable(s) {
    const th = s.threshold;
    const yes = (b) => (b ? '<span class="ch">yes</span>' : '<span class="dim">no</span>');
    if (!s.book_ok) return '<h3>trigger</h3><p class="hint">book not filled yet: both instruments need a bid and an ask.</p>';
    return `
<h3>trigger (threshold ${th} tick${th === 1 ? '' : 's'})</h3>
<table class="kv">
  <tr><td>buy</td><td class="dim">lead_bid ≥ tgt_ask + th</td><td>${px(s.lead_bid)} ≥ ${px(s.tgt_ask + th)}</td><td>${yes(s.buy)}</td></tr>
  <tr><td>sell</td><td class="dim">lead_ask + th ≤ tgt_bid</td><td>${px(s.lead_ask + th)} ≤ ${px(s.tgt_bid)}</td><td>${yes(s.sell)}</td></tr>
</table>`;
  }

  function orderLog(s, view) {
    const done = view.orders.filter((o) => o.cycle <= s.cycle);
    if (!done.length) return '<h3>orders sent</h3><p class="hint">none yet</p>';
    const rows = done.slice(-6).reverse().map((o) =>
      `<tr${o.cycle === s.cycle ? ' class="ch"' : ''}><td>cyc ${o.cycle}</td><td>${o.side ? 'SELL' : 'BUY'} ${o.size} TGT @ ${px(o.price)}</td><td class="dim">${o.latency} cyc = ${(o.latency * NS).toFixed(1)} ns</td></tr>`
    );
    return `<h3>orders sent (${done.length})</h3><table class="kv">${rows.join('')}</table>`;
  }

  // ---------------------------------------------------------------- status line
  function lastDecode(s, view) {
    for (let c = s.cycle; c >= 0; c--) {
      const h = view.sim.history[c];
      if (h.msg_valid) return c - view.feed.starts[h._ptag];
    }
    return null;
  }

  function status(level, s, view) {
    const parts = [`cycle ${s.cycle}`, `bus ${st.width}-bit`, `clock 156.25 MHz · 6.4 ns`];
    if (level === 1) {
      const d = lastDecode(s, view);
      parts.push(d === null ? 'decode: —' : `decode: ${cyc(d)}`);
    } else if (level === 2) {
      const d = lastDecode(s, view);
      parts.push(d === null ? 'wire → book: —' : `wire → book: ${cyc(d + 1)}`);
    } else {
      const done = view.orders.filter((o) => o.cycle <= s.cycle);
      const last = done[done.length - 1];
      parts.push(last ? `<b>tick-to-trade ${cyc(last.latency)}</b>` : 'tick-to-trade: —', `orders ${done.length}`);
    }
    return LAB.statusLine(parts);
  }

  // ---------------------------------------------------------------- controls
  function marketButtons(view, level) {
    const push = (fn) => () => view.feed.push(fn(view.feed.market));
    if (level === 1) {
      return UI.row(
        UI.button('send quote', push((m) => m.leadMove(m.rand() < 0.5 ? 1 : -1, 0))),
        UI.button('send trade print', push((m) => m.trade(0)))
      );
    }
    return UI.row(
      UI.button('lead +1', push((m) => m.leadMove(+1, 0))),
      UI.button('lead +5', push((m) => m.leadMove(+5, 0))),
      UI.button('lead −5', push((m) => m.leadMove(-5, 0))),
      UI.button('target catches up', push((m) => m.catchUp(0)))
    );
  }

  LAB.pipelineLesson = function (ctx, level) {
    const auto = { on: level !== 2 };
    const view = new LAB.SimView(ctx, {
      design: () => LAB.designs.pipeline(st.width),
      onReset: (v) => {
        v.feed = new Feed.Source({ width: st.width, seed: 7, auto: auto.on, script: level === 2 ? 'snapshot' : 'full' });
        v.orders = [];
      },
      inputs: (c, v) => {
        const ctl = { rst: c < 1 ? 1 : 0, armed: level >= 3 ? st.armed : 0, threshold: st.threshold };
        return Object.assign(ctl, ctl.rst ? v.feed.idleInputs() : v.feed.next(c));
      },
      afterStep: (s, v) => {
        if (s._xsop) v.orders.push(Object.assign({ cycle: s.cycle, latency: s.cycle - v.feed.starts[s._xtag] }, s._xord));
      },
      signals: () => signals(level, st.width),
      strip: strip(level),
      codeTags: level === 1 ? ['parse'] : level === 2 ? ['parse', 'book'] : ['parse', 'book', 'trigger', 'tx', 'top'],
      codeDefault: level === 1 ? 'parse' : level === 2 ? 'book' : 'trigger',
      values: (s, prev, v) => {
        if (level === 1) return wireTable(s, v);
        if (level === 2) return bookTable(s, prev) + wireTable(s, v);
        return orderLog(s, v) + triggerTable(s) + bookTable(s, prev);
      },
      status: (s, v) => status(level, s, v),
    });

    const c = ctx.controls;
    c.append(
      UI.choice('bus width', [
        { value: 8, label: '8-bit', title: '1 byte per clock: easy to follow' },
        { value: 64, label: '64-bit', title: '8 bytes per clock: what a 10 Gb/s port delivers' },
      ], st.width, (w) => {
        st.width = w;
        view.reset();
      })
    );
    if (level >= 3) {
      c.append(
        UI.slider('threshold', { min: 0, max: 8, step: 1, value: st.threshold, fmt: (v) => `${v} tick${v === 1 ? '' : 's'}` }, (v) => (st.threshold = v)),
        UI.row(UI.toggle('armed (software kill switch)', st.armed, (x) => (st.armed = x ? 1 : 0)))
      );
    }
    c.append(
      UI.row(UI.toggle('random market feed', auto.on, (x) => {
        auto.on = x;
        view.feed.auto = x;
      })),
      marketButtons(view, level),
      view.basicControls()
    );
    return view;
  };
})(globalThis.LAB);
