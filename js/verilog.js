/* fpga-lab: the Verilog shown on the page.
 *
 * This file is the single source of truth: test/run_tests.js writes rtl/*.v
 * from it and runs those files through Icarus Verilog. A trailing `//@tag`
 * names when a line acts (matched against the tags the JS models report);
 * it is stripped before display and before export.
 */
(function (LAB) {
  'use strict';

  const SRC = {};

  SRC.clock_demo = `
// Lesson 0: a 4-bit counter and a two-stage shift register.
module clock_demo (
  input  wire       clk,
  input  wire       rst,
  input  wire       en,
  input  wire       d_in,
  output reg  [3:0] count,
  output reg        a,
  output reg        b
);
  // Everything inside runs at the same instant: the rising clock edge.
  always @(posedge clk) begin
    if (rst) begin
      count <= 4'd0;                     //@rst
      a     <= 1'b0;                     //@rst
      b     <= 1'b0;                     //@rst
    end else begin
      if (en) count <= count + 4'd1;     //@inc
      a <= d_in;                         //@a
      b <= a;  // reads the OLD a        //@b
    end
  end
endmodule
`;

  SRC.feed_parser = `
// Lesson 1: decode a market data message one byte per clock.
module feed_parser (
  input  wire        clk,
  input  wire        rst,
  input  wire        in_valid,   // a byte is on in_data
  input  wire [7:0]  in_data,
  output reg         msg_valid,  // one-cycle pulse per quote
  output reg  [7:0]  msg_inst,
  output reg         msg_side,   // 0 = bid, 1 = ask
  output reg  [23:0] msg_price,  // in ticks
  output reg  [15:0] msg_size
);
  reg [2:0] idx;                 // which byte comes next
  reg [7:0] typ;

  always @(posedge clk) begin
    msg_valid <= 1'b0;
    if (rst) begin
      idx <= 3'd0;                                   //@rst
    end else if (in_valid) begin
      idx <= idx + 3'd1;                             //@b0,b1,b2,b3,b4,b5,b6,b7
      case (idx)
        3'd0: typ              <= in_data;           //@b0
        3'd1: msg_inst         <= in_data;           //@b1
        3'd2: msg_side         <= (in_data == 8'h53);//@b2
        3'd3: msg_price[23:16] <= in_data;           //@b3
        3'd4: msg_price[15:8]  <= in_data;           //@b4
        3'd5: msg_price[7:0]   <= in_data;           //@b5
        3'd6: msg_size[15:8]   <= in_data;           //@b6
        3'd7: begin
          msg_size[7:0] <= in_data;                  //@b7
          msg_valid     <= (typ == 8'h51);  // 'Q'   //@b7
        end
      endcase
    end
  end
endmodule
`;

  SRC.feed_parser64 = `
// Lesson 1, wide bus: the whole 8-byte message arrives in one clock.
module feed_parser64 (
  input  wire        clk,
  input  wire        rst,
  input  wire        in_valid,   // a whole message is on in_data
  input  wire [63:0] in_data,
  output reg         msg_valid,
  output reg  [7:0]  msg_inst,
  output reg         msg_side,
  output reg  [23:0] msg_price,
  output reg  [15:0] msg_size
);
  always @(posedge clk) begin
    msg_valid <= !rst && in_valid && (in_data[63:56] == 8'h51);  //@valid
    if (in_valid) begin
      msg_inst  <= in_data[55:48];                               //@valid
      msg_side  <= (in_data[47:40] == 8'h53);                    //@valid
      msg_price <= in_data[39:16];                               //@valid
      msg_size  <= in_data[15:0];                                //@valid
    end
  end
endmodule
`;

  SRC.top_of_book = `
// Lesson 2: best bid and ask for two instruments, held in registers.
module top_of_book (
  input  wire        clk,
  input  wire        rst,
  input  wire        msg_valid,
  input  wire [7:0]  msg_inst,
  input  wire        msg_side,
  input  wire [23:0] msg_price,
  input  wire [15:0] msg_size,
  output reg  [23:0] lead_bid,
  output reg  [23:0] lead_ask,
  output reg  [23:0] tgt_bid,
  output reg  [23:0] tgt_ask,
  output reg  [15:0] tgt_bid_sz,
  output reg  [15:0] tgt_ask_sz
);
  localparam LEAD = 8'h01, TGT = 8'h02;

  always @(posedge clk) begin
    if (rst) begin
      lead_bid   <= 24'd0;  lead_ask   <= 24'd0;            //@rst
      tgt_bid    <= 24'd0;  tgt_ask    <= 24'd0;            //@rst
      tgt_bid_sz <= 16'd0;  tgt_ask_sz <= 16'd0;            //@rst
    end else if (msg_valid) begin
      if (msg_inst == LEAD && !msg_side) lead_bid <= msg_price;   //@lb
      if (msg_inst == LEAD &&  msg_side) lead_ask <= msg_price;   //@la
      if (msg_inst == TGT  && !msg_side) begin                    //@tb
        tgt_bid    <= msg_price;                                  //@tb
        tgt_bid_sz <= msg_size;                                   //@tb
      end
      if (msg_inst == TGT  &&  msg_side) begin                    //@ta
        tgt_ask    <= msg_price;                                  //@ta
        tgt_ask_sz <= msg_size;                                   //@ta
      end
    end
  end
endmodule
`;

  SRC.trigger = `
// Lesson 3: decide to trade. Comparators only; no software in this path.
module trigger (
  input  wire        clk,
  input  wire        rst,
  input  wire        armed,       // written by software: on/off
  input  wire [15:0] threshold,   // written by software: ticks
  input  wire [23:0] lead_bid,
  input  wire [23:0] lead_ask,
  input  wire [23:0] tgt_bid,
  input  wire [23:0] tgt_ask,
  input  wire [15:0] tgt_bid_sz,
  input  wire [15:0] tgt_ask_sz,
  output reg         fire,        // one-cycle pulse: send an order
  output reg         fire_side,   // 0 = buy target, 1 = sell target
  output reg  [23:0] fire_price,
  output reg  [15:0] fire_size
);
  wire book_ok = (lead_bid != 0) && (lead_ask != 0) &&
                 (tgt_bid  != 0) && (tgt_ask  != 0);
  // LEAD rose past TGT's ask: that ask is stale, buy it.
  wire buy  = book_ok && (lead_bid >= tgt_ask + threshold);   //@buy
  // LEAD fell below TGT's bid: that bid is stale, sell to it.
  wire sell = book_ok && (lead_ask + threshold <= tgt_bid);   //@sell
  wire opp  = buy || sell;                                    //@buy,sell
  reg  opp_q;                     // opp one cycle ago

  always @(posedge clk) begin
    if (rst) begin
      opp_q <= 1'b0;                                          //@rst
      fire  <= 1'b0;                                          //@rst
    end else begin
      opp_q      <= opp;
      fire       <= armed && opp && !opp_q;  // new ones only //@fire
      fire_side  <= sell;
      fire_price <= buy ? tgt_ask    : tgt_bid;
      fire_size  <= buy ? tgt_ask_sz : tgt_bid_sz;
    end
  end
endmodule
`;

  SRC.order_tx = `
// Lesson 3: send the order, one byte per clock.
module order_tx (
  input  wire        clk,
  input  wire        rst,
  input  wire        fire,
  input  wire        fire_side,
  input  wire [23:0] fire_price,
  input  wire [15:0] fire_size,
  output reg         out_valid,
  output reg  [7:0]  out_data
);
  reg [63:0] shreg;               // bytes still to send
  reg [3:0]  left;

  always @(posedge clk) begin
    if (rst) begin
      out_valid <= 1'b0;                                      //@rst
      left      <= 4'd0;                                      //@rst
    end else if (fire && left == 0) begin
      out_valid <= 1'b1;                                      //@start
      out_data  <= 8'h4F;                  // 'O' new order   //@start
      shreg     <= {8'h02, (fire_side ? 8'h53 : 8'h42),       //@start
                    fire_price, fire_size, 8'h00};            //@start
      left      <= 4'd7;                                      //@start
    end else if (left != 0) begin
      out_valid <= 1'b1;                                      //@shift
      out_data  <= shreg[63:56];                              //@shift
      shreg     <= {shreg[55:0], 8'h00};                      //@shift
      left      <= left - 4'd1;                               //@shift
    end else begin
      out_valid <= 1'b0;
    end
  end
endmodule
`;

  SRC.order_tx64 = `
// Lesson 3, wide bus: the whole order leaves in one clock.
module order_tx64 (
  input  wire        clk,
  input  wire        rst,
  input  wire        fire,
  input  wire        fire_side,
  input  wire [23:0] fire_price,
  input  wire [15:0] fire_size,
  output reg         out_valid,
  output reg  [63:0] out_data
);
  always @(posedge clk) begin
    out_valid <= fire && !rst;                                //@fire
    if (fire)                                                 //@fire
      out_data <= {8'h4F, 8'h02, (fire_side ? 8'h53 : 8'h42), //@fire
                   fire_price, fire_size};                    //@fire
  end
endmodule
`;

  const top = (w) => {
    const narrow = w === 8;
    const name = narrow ? 'tick_to_trade' : 'tick_to_trade64';
    const bus = narrow ? '[7:0] ' : '[63:0]';
    const parser = narrow ? 'feed_parser  ' : 'feed_parser64';
    const tx = narrow ? 'order_tx  ' : 'order_tx64';
    return `
// The whole fast path: market data in, order out. Four blocks in a row.
module ${name} (
  input  wire        clk,
  input  wire        rst,
  input  wire        in_valid,
  input  wire ${bus} in_data,
  input  wire        armed,       // control registers,
  input  wire [15:0] threshold,   // written by software
  output wire        out_valid,
  output wire ${bus} out_data
);
  wire        msg_valid, msg_side, fire, fire_side;
  wire [7:0]  msg_inst;
  wire [23:0] msg_price, fire_price;
  wire [15:0] msg_size, fire_size, tgt_bid_sz, tgt_ask_sz;
  wire [23:0] lead_bid, lead_ask, tgt_bid, tgt_ask;

  ${parser} u_parse (.clk(clk), .rst(rst),                 //@parse
    .in_valid(in_valid), .in_data(in_data),                  //@parse
    .msg_valid(msg_valid), .msg_inst(msg_inst),              //@parse
    .msg_side(msg_side), .msg_price(msg_price),              //@parse
    .msg_size(msg_size));                                    //@parse

  top_of_book   u_book (.clk(clk), .rst(rst),                //@book
    .msg_valid(msg_valid), .msg_inst(msg_inst),              //@book
    .msg_side(msg_side), .msg_price(msg_price),              //@book
    .msg_size(msg_size),                                     //@book
    .lead_bid(lead_bid), .lead_ask(lead_ask),                //@book
    .tgt_bid(tgt_bid), .tgt_ask(tgt_ask),                    //@book
    .tgt_bid_sz(tgt_bid_sz), .tgt_ask_sz(tgt_ask_sz));       //@book

  trigger       u_trig (.clk(clk), .rst(rst),                //@trig
    .armed(armed), .threshold(threshold),                    //@trig
    .lead_bid(lead_bid), .lead_ask(lead_ask),                //@trig
    .tgt_bid(tgt_bid), .tgt_ask(tgt_ask),                    //@trig
    .tgt_bid_sz(tgt_bid_sz), .tgt_ask_sz(tgt_ask_sz),        //@trig
    .fire(fire), .fire_side(fire_side),                      //@trig
    .fire_price(fire_price), .fire_size(fire_size));         //@trig

  ${tx}    u_tx   (.clk(clk), .rst(rst),                //@tx
    .fire(fire), .fire_side(fire_side),                      //@tx
    .fire_price(fire_price), .fire_size(fire_size),          //@tx
    .out_valid(out_valid), .out_data(out_data));             //@tx
endmodule
`;
  };
  SRC.tick_to_trade = top(8);
  SRC.tick_to_trade64 = top(64);

  // ---------------------------------------------------------------- parsing
  const TAG = /\s*\/\/@([\w,]+)\s*$/;
  const parsed = {};

  function parse(name) {
    if (parsed[name]) return parsed[name];
    const raw = SRC[name];
    if (raw === undefined) throw new Error('no Verilog for ' + name);
    const lines = raw.replace(/^\n/, '').replace(/\n$/, '').split('\n').map((line) => {
      const m = line.match(TAG);
      return {
        text: (m ? line.slice(0, m.index) : line).replace(/\s+$/, ''),
        tags: m ? m[1].split(',') : [],
      };
    });
    return (parsed[name] = { name, lines });
  }

  function plain(name) {
    return parse(name).lines.map((l) => l.text).join('\n') + '\n';
  }

  // ---------------------------------------------------------------- display
  const KW = new Set(
    'module endmodule input output wire reg always posedge negedge begin end if else case endcase assign localparam parameter'.split(' ')
  );
  const TOKEN = /(\/\/.*$)|(\d+'[bdh][0-9a-fA-F_xzXZ]+)|(\b\d+\b)|([A-Za-z_][\w$]*)|([<>=!]=|<=|&&|\|\||[{}()[\]?:;,.])/g;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(text) {
    let out = '';
    let last = 0;
    text.replace(TOKEN, (m, com, num, dec, id, op, at) => {
      out += esc(text.slice(last, at));
      if (com) out += `<span class="v-com">${esc(com)}</span>`;
      else if (num || dec) out += `<span class="v-num">${esc(m)}</span>`;
      else if (id) out += KW.has(id) ? `<span class="v-kw">${id}</span>` : esc(id);
      else out += `<span class="v-op">${esc(op)}</span>`;
      last = at + m.length;
      return m;
    });
    return out + esc(text.slice(last));
  }

  // Render into `el`; lines carrying any active tag are lit.
  function render(el, name, active) {
    const on = new Set(active || []);
    const { lines } = parse(name);
    let html = '';
    let first = -1;
    lines.forEach((l, k) => {
      const lit = l.tags.some((t) => on.has(t));
      if (lit && first < 0) first = k;
      html +=
        `<div class="ln${lit ? ' on' : ''}"><span class="no">${k + 1}</span>` +
        `<span class="mk">${lit ? '▶' : ''}</span><span class="src">${highlight(l.text) || ' '}</span></div>`;
    });
    el.innerHTML = html;
    return first;
  }

  LAB.Verilog = { SRC, parse, plain, render, highlight, names: () => Object.keys(SRC) };
})((globalThis.LAB = globalThis.LAB || {}));
