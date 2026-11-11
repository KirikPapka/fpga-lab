/* fpga-lab: synthetic market and the byte stream that carries it.
 *
 * Message format, 8 bytes, big-endian:
 *   0  type        'Q' 0x51 quote update, 'T' 0x54 trade print (the book ignores it)
 *   1  instrument  0x01 LEAD (moves first, e.g. an index future)
 *                  0x02 TGT  (reacts later, e.g. an ETF that tracks it)
 *   2  side        'B' 0x42 bid, 'S' 0x53 ask
 *   3-5 price      24-bit, in ticks of 0.01
 *   6-7 size       16-bit
 * A quote message carries the new best price on that side (a top-of-book feed).
 */
(function (LAB) {
  'use strict';

  const LEAD = 0x01;
  const TGT = 0x02;
  const QUOTE = 0x51;
  const TRADE = 0x54;
  const BID = 0x42;
  const ASK = 0x53;

  // mulberry32: small, fast, seedable. Same seed, same market.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function encode(m) {
    return [
      m.type,
      m.inst,
      m.side,
      (m.price >> 16) & 0xff,
      (m.price >> 8) & 0xff,
      m.price & 0xff,
      (m.size >> 8) & 0xff,
      m.size & 0xff,
    ];
  }

  function toWord(bytes) {
    let w = 0n;
    for (const b of bytes) w = (w << 8n) | BigInt(b);
    return w;
  }

  const FIELDS = ['type', 'instrument', 'side', 'price', 'price', 'price', 'size', 'size'];

  function describe(m) {
    if (!m) return '';
    const kind = m.type === QUOTE ? 'quote' : m.type === TRADE ? 'trade' : 'type 0x' + m.type.toString(16);
    const side = m.side === ASK ? 'ask' : 'bid';
    return `${kind} ${LAB.fmt.inst(m.inst)} ${side} ${LAB.fmt.px(m.price)} × ${m.size}`;
  }

  // The market: LEAD moves first, TGT catches up some cycles later.
  // That delay is the window a fast trader can use.
  class Market {
    constructor(seed) {
      this.rand = rng(seed);
      this.lead = { bid: 10000, ask: 10002 };
      this.tgt = { bid: 10000, ask: 10002 };
    }

    quote(inst, side, price, size, gap) {
      return { type: QUOTE, inst, side, price, size, gap };
    }

    snapshot() {
      return [
        this.quote(LEAD, BID, this.lead.bid, 50, 1),
        this.quote(LEAD, ASK, this.lead.ask, 50, 1),
        this.quote(TGT, BID, this.tgt.bid, 300, 1),
        this.quote(TGT, ASK, this.tgt.ask, 300, 1),
      ];
    }

    // Move one instrument; send the side moving away first so the book never crosses.
    move(book, inst, ticks, size, gap) {
      book.bid += ticks;
      book.ask += ticks;
      const bid = this.quote(inst, BID, book.bid, size, gap);
      const ask = this.quote(inst, ASK, book.ask, size, gap);
      const pair = ticks >= 0 ? [ask, bid] : [bid, ask];
      pair[1].gap = 1;
      return pair;
    }

    leadMove(ticks, gap = 2) {
      return this.move(this.lead, LEAD, ticks, 50, gap);
    }

    catchUp(gap = 2) {
      const ticks = this.lead.bid - this.tgt.bid;
      const size = 100 * (1 + Math.floor(this.rand() * 9));
      return this.move(this.tgt, TGT, ticks, size, gap);
    }

    trade(gap = 2) {
      const side = this.rand() < 0.5 ? BID : ASK;
      const price = side === BID ? this.tgt.bid : this.tgt.ask;
      return [{ type: TRADE, inst: TGT, side, price, size: 100 * (1 + Math.floor(this.rand() * 5)), gap }];
    }

    // The first thing every run sees: a book, a jump on LEAD, TGT catching up.
    script() {
      return [...this.snapshot(), ...this.leadMove(+5, 3), ...this.catchUp(8)];
    }

    // One random event: LEAD moves, TGT follows after a lag.
    randomEvent() {
      const r = this.rand;
      if (r() < 0.12) return this.trade(2 + Math.floor(r() * 4));
      const big = r() < 0.35;
      const mag = big ? 3 + Math.floor(r() * 5) : 1 + Math.floor(r() * 2);
      // Gentle pull back to 100.00 so prices stay readable.
      const drift = (10000 - this.lead.bid) / 200;
      const sign = r() < 0.5 + Math.max(-0.3, Math.min(0.3, drift)) ? 1 : -1;
      const out = this.leadMove(sign * mag, 2 + Math.floor(r() * 5));
      if (r() < 0.25) out.push(...this.trade(2));
      out.push(...this.catchUp(4 + Math.floor(r() * 16)));
      return out;
    }
  }

  // Turns queued messages into what appears on the input pins each cycle.
  class Source {
    // script: 'full' = book, then a scripted jump; 'snapshot' = only fill the book.
    constructor({ width = 8, seed = 7, auto = true, script = 'full' } = {}) {
      this.width = width;
      this.auto = auto;
      this.market = new Market(seed);
      this.queue = script === 'snapshot' ? this.market.snapshot() : this.market.script();
      this.cur = null;
      this.pos = 0;
      this.idle = 99;
      this.nextTag = 0;
      this.sent = []; // every message put on the wire, indexed by tag
      this.starts = []; // cycle each message's first byte appeared
    }

    push(msgs) {
      this.queue.push(...msgs);
    }

    idleInputs() {
      return { in_valid: 0, in_data: this.width === 64 ? 0n : 0, _tag: -1 };
    }

    next(cycle) {
      if (!this.cur) {
        if (!this.queue.length && this.auto) this.queue.push(...this.market.randomEvent());
        if (!this.queue.length || this.idle < (this.queue[0].gap || 0)) {
          this.idle++;
          return this.idleInputs();
        }
        const m = this.queue.shift();
        m.tag = this.nextTag++;
        m.bytes = encode(m);
        this.sent[m.tag] = m;
        this.starts[m.tag] = cycle;
        this.cur = m;
        this.pos = 0;
      }
      const m = this.cur;
      let out;
      if (this.width === 64) {
        out = { in_valid: 1, in_data: toWord(m.bytes), _tag: m.tag, _pos: 0 };
        this.pos = 8;
      } else {
        out = { in_valid: 1, in_data: m.bytes[this.pos], _tag: m.tag, _pos: this.pos };
        this.pos++;
      }
      if (this.pos >= 8) {
        this.cur = null;
        this.idle = 0;
      }
      return out;
    }
  }

  LAB.Feed = {
    LEAD, TGT, QUOTE, TRADE, BID, ASK, FIELDS,
    rng, encode, toWord, describe, Market, Source,
  };
})((globalThis.LAB = globalThis.LAB || {}));
