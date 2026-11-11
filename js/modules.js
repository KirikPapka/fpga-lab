/* fpga-lab: JavaScript models of the Verilog in verilog.js, line for line.
 *
 * Each module has init() and next(regs, inputs) -> regs after the clock edge,
 * plus tags(...) naming the Verilog lines that act on this cycle (for the
 * highlight). Keys starting with "_" are bookkeeping for the page only: they
 * are not in the hardware and are not compared against the Verilog.
 */
(function (LAB) {
  'use strict';

  const LEAD = 0x01;
  const TGT = 0x02;
  const M = {};

  // ---------------------------------------------------------------- lesson 0
  M.clockDemo = {
    init: () => ({ count: 0, a: 0, b: 0 }),
    next(r, i) {
      if (i.rst) return { count: 0, a: 0, b: 0 };
      return { count: i.en ? (r.count + 1) & 0xf : r.count, a: i.d_in & 1, b: r.a };
    },
    tags(r, i) {
      if (i.rst) return ['rst'];
      return i.en ? ['inc', 'a', 'b'] : ['a', 'b'];
    },
  };

  // ---------------------------------------------------------------- parsers
  M.parser8 = {
    init: () => ({ idx: 0, typ: 0, msg_valid: 0, msg_inst: 0, msg_side: 0, msg_price: 0, msg_size: 0, _ptag: -1 }),
    next(r, i) {
      const n = Object.assign({}, r);
      n.msg_valid = 0;
      if (i.rst) {
        n.idx = 0;
        return n;
      }
      if (!i.in_valid) return n;
      const d = i.in_data;
      n.idx = (r.idx + 1) & 7;
      switch (r.idx) {
        case 0: n.typ = d; n._ptag = i._tag; break;
        case 1: n.msg_inst = d; break;
        case 2: n.msg_side = d === 0x53 ? 1 : 0; break;
        case 3: n.msg_price = (r.msg_price & 0x00ffff) | (d << 16); break;
        case 4: n.msg_price = (r.msg_price & 0xff00ff) | (d << 8); break;
        case 5: n.msg_price = (r.msg_price & 0xffff00) | d; break;
        case 6: n.msg_size = (r.msg_size & 0x00ff) | (d << 8); break;
        case 7:
          n.msg_size = (r.msg_size & 0xff00) | d;
          n.msg_valid = r.typ === 0x51 ? 1 : 0;
          break;
      }
      return n;
    },
    tags(r, i) {
      if (i.rst) return ['rst'];
      return i.in_valid ? ['b' + r.idx] : [];
    },
  };

  M.parser64 = {
    init: () => ({ msg_valid: 0, msg_inst: 0, msg_side: 0, msg_price: 0, msg_size: 0, _ptag: -1 }),
    next(r, i) {
      const n = Object.assign({}, r);
      const w = i.in_data;
      const byte = (k) => Number((w >> BigInt(8 * k)) & 0xffn);
      n.msg_valid = !i.rst && i.in_valid && byte(7) === 0x51 ? 1 : 0;
      if (i.in_valid) {
        n.msg_inst = byte(6);
        n.msg_side = byte(5) === 0x53 ? 1 : 0;
        n.msg_price = Number((w >> 16n) & 0xffffffn);
        n.msg_size = Number(w & 0xffffn);
        n._ptag = i._tag;
      }
      return n;
    },
    tags(r, i) {
      return i.in_valid ? ['valid'] : [];
    },
  };

  // ---------------------------------------------------------------- book
  M.book = {
    init: () => ({ lead_bid: 0, lead_ask: 0, tgt_bid: 0, tgt_ask: 0, tgt_bid_sz: 0, tgt_ask_sz: 0, _btag: -1 }),
    // i = parser outputs + rst
    next(r, i) {
      if (i.rst) return Object.assign(M.book.init(), { _btag: r._btag });
      const n = Object.assign({}, r);
      if (!i.msg_valid) return n;
      n._btag = i._ptag;
      if (i.msg_inst === LEAD && !i.msg_side) n.lead_bid = i.msg_price;
      if (i.msg_inst === LEAD && i.msg_side) n.lead_ask = i.msg_price;
      if (i.msg_inst === TGT && !i.msg_side) {
        n.tgt_bid = i.msg_price;
        n.tgt_bid_sz = i.msg_size;
      }
      if (i.msg_inst === TGT && i.msg_side) {
        n.tgt_ask = i.msg_price;
        n.tgt_ask_sz = i.msg_size;
      }
      return n;
    },
    tags(r, i) {
      if (i.rst) return ['rst'];
      if (!i.msg_valid) return [];
      const inst = i.msg_inst === LEAD ? 'l' : i.msg_inst === TGT ? 't' : 'x';
      return [inst + (i.msg_side ? 'a' : 'b')];
    },
  };

  // ---------------------------------------------------------------- trigger
  M.trigger = {
    init: () => ({ opp_q: 0, fire: 0, fire_side: 0, fire_price: 0, fire_size: 0, _ttag: -1 }),
    // Combinational part: wires computed from the book registers this cycle.
    comb(b, i) {
      const ok = b.lead_bid !== 0 && b.lead_ask !== 0 && b.tgt_bid !== 0 && b.tgt_ask !== 0;
      const th = i.threshold;
      const buy = ok && b.lead_bid >= ((b.tgt_ask + th) & 0xffffff) ? 1 : 0;
      const sell = ok && ((b.lead_ask + th) & 0xffffff) <= b.tgt_bid ? 1 : 0;
      return { book_ok: ok ? 1 : 0, buy, sell, opp: buy | sell };
    },
    next(r, b, w, i) {
      const n = Object.assign({}, r);
      if (i.rst) {
        n.opp_q = 0;
        n.fire = 0;
        return n;
      }
      n.opp_q = w.opp;
      n.fire = i.armed && w.opp && !r.opp_q ? 1 : 0;
      n.fire_side = w.sell;
      n.fire_price = w.buy ? b.tgt_ask : b.tgt_bid;
      n.fire_size = w.buy ? b.tgt_ask_sz : b.tgt_bid_sz;
      if (n.fire) n._ttag = b._btag;
      return n;
    },
    tags(r, w, i) {
      if (i.rst) return ['rst'];
      const t = [];
      if (w.buy) t.push('buy');
      if (w.sell) t.push('sell');
      if (i.armed && w.opp && !r.opp_q) t.push('fire');
      return t;
    },
  };

  // ---------------------------------------------------------------- order out
  const orderOf = (t) => ({ side: t.fire_side, price: t.fire_price, size: t.fire_size });

  M.tx8 = {
    init: () => ({ out_valid: 0, out_data: 0, left: 0, shreg: [0, 0, 0, 0, 0, 0, 0, 0], _xtag: -1, _xsop: 0, _xord: null }),
    // t = trigger registers
    next(r, t, i) {
      const n = Object.assign({}, r, { _xsop: 0 });
      if (i.rst) {
        n.out_valid = 0;
        n.left = 0;
        return n;
      }
      if (t.fire && r.left === 0) {
        const p = t.fire_price;
        const s = t.fire_size;
        n.out_valid = 1;
        n.out_data = 0x4f;
        n.shreg = [0x02, t.fire_side ? 0x53 : 0x42, (p >> 16) & 0xff, (p >> 8) & 0xff, p & 0xff, (s >> 8) & 0xff, s & 0xff, 0];
        n.left = 7;
        n._xsop = 1;
        n._xtag = t._ttag;
        n._xord = orderOf(t);
      } else if (r.left !== 0) {
        n.out_valid = 1;
        n.out_data = r.shreg[0];
        n.shreg = r.shreg.slice(1).concat([0]);
        n.left = r.left - 1;
      } else {
        n.out_valid = 0;
      }
      return n;
    },
    tags(r, t, i) {
      if (i.rst) return ['rst'];
      if (t.fire && r.left === 0) return ['start'];
      if (r.left !== 0) return ['shift'];
      return [];
    },
  };

  M.tx64 = {
    init: () => ({ out_valid: 0, out_data: 0n, _xtag: -1, _xsop: 0, _xord: null }),
    next(r, t, i) {
      const n = Object.assign({}, r, { _xsop: 0 });
      n.out_valid = t.fire && !i.rst ? 1 : 0;
      if (t.fire) {
        n.out_data =
          (0x4fn << 56n) |
          (0x02n << 48n) |
          (BigInt(t.fire_side ? 0x53 : 0x42) << 40n) |
          (BigInt(t.fire_price) << 16n) |
          BigInt(t.fire_size);
      }
      if (n.out_valid) {
        n._xsop = 1;
        n._xtag = t._ttag;
        n._xord = orderOf(t);
      }
      return n;
    },
    tags(r, t) {
      return t.fire ? ['fire'] : [];
    },
  };

  // ---------------------------------------------------------------- designs
  const designs = {};

  designs.clock = function () {
    return {
      verilog: [{ name: 'clock_demo', tags: 'clock' }],
      init: () => ({ c: M.clockDemo.init() }),
      eval(r, i) {
        return {
          rst: i.rst, en: i.en, d_in: i.d_in,
          count: r.c.count, a: r.c.a, b: r.c.b,
          _tags: { clock: M.clockDemo.tags(r.c, i) },
        };
      },
      next(r, i) {
        return { c: M.clockDemo.next(r.c, i) };
      },
    };
  };

  // The full tick-to-trade path. Lessons 1-3 all run this and show more of it each time.
  designs.pipeline = function (width) {
    const P = width === 64 ? M.parser64 : M.parser8;
    const X = width === 64 ? M.tx64 : M.tx8;
    const bookIn = (r, i) => Object.assign({ rst: i.rst }, r.p);
    return {
      width,
      verilog: [
        { name: width === 64 ? 'feed_parser64' : 'feed_parser', tags: 'parse' },
        { name: 'top_of_book', tags: 'book' },
        { name: 'trigger', tags: 'trigger' },
        { name: width === 64 ? 'order_tx64' : 'order_tx', tags: 'tx' },
        { name: width === 64 ? 'tick_to_trade64' : 'tick_to_trade', tags: 'top' },
      ],
      init: () => ({ p: P.init(), b: M.book.init(), t: M.trigger.init(), x: X.init() }),
      eval(r, i) {
        const w = M.trigger.comb(r.b, i);
        const s = Object.assign(
          { rst: i.rst, in_valid: i.in_valid, in_data: i.in_data, armed: i.armed, threshold: i.threshold, _tag: i._tag, _pos: i._pos },
          r.p, r.b, r.t, r.x, w
        );
        const top = [];
        if (i.in_valid) top.push('parse');
        if (r.p.msg_valid) top.push('book');
        if (w.opp || r.t.fire) top.push('trig');
        if (r.x.out_valid || r.t.fire) top.push('tx');
        s._tags = {
          parse: P.tags(r.p, i),
          book: M.book.tags(r.b, bookIn(r, i)),
          trigger: M.trigger.tags(r.t, w, i),
          tx: X.tags(r.x, r.t, i),
          top,
        };
        return s;
      },
      next(r, i) {
        return {
          p: P.next(r.p, i),
          b: M.book.next(r.b, bookIn(r, i)),
          t: M.trigger.next(r.t, r.b, M.trigger.comb(r.b, i), i),
          x: X.next(r.x, r.t, i),
        };
      },
    };
  };

  // Signals compared against the Verilog simulator: [verilog path under dut, snapshot key, bits].
  designs.probes = {
    clock: () => [
      ['count', 'count', 4],
      ['a', 'a', 1],
      ['b', 'b', 1],
    ],
    pipeline: (width) => [
      ['in_valid', 'in_valid', 1],
      ['in_data', 'in_data', width],
      ...(width === 8 ? [['u_parse.idx', 'idx', 3]] : []),
      ['msg_valid', 'msg_valid', 1],
      ['msg_inst', 'msg_inst', 8],
      ['msg_side', 'msg_side', 1],
      ['msg_price', 'msg_price', 24],
      ['msg_size', 'msg_size', 16],
      ['lead_bid', 'lead_bid', 24],
      ['lead_ask', 'lead_ask', 24],
      ['tgt_bid', 'tgt_bid', 24],
      ['tgt_ask', 'tgt_ask', 24],
      ['tgt_bid_sz', 'tgt_bid_sz', 16],
      ['tgt_ask_sz', 'tgt_ask_sz', 16],
      ['u_trig.opp', 'opp', 1],
      ['fire', 'fire', 1],
      ['fire_side', 'fire_side', 1],
      ['fire_price', 'fire_price', 24],
      ['fire_size', 'fire_size', 16],
      ['out_valid', 'out_valid', 1],
      ['out_data', 'out_data', width],
    ],
  };

  LAB.M = M;
  LAB.designs = designs;
})((globalThis.LAB = globalThis.LAB || {}));
