// The whole fast path: market data in, order out. Four blocks in a row.
module tick_to_trade64 (
  input  wire        clk,
  input  wire        rst,
  input  wire        in_valid,
  input  wire [63:0] in_data,
  input  wire        armed,       // control registers,
  input  wire [15:0] threshold,   // written by software
  output wire        out_valid,
  output wire [63:0] out_data
);
  wire        msg_valid, msg_side, fire, fire_side;
  wire [7:0]  msg_inst;
  wire [23:0] msg_price, fire_price;
  wire [15:0] msg_size, fire_size, tgt_bid_sz, tgt_ask_sz;
  wire [23:0] lead_bid, lead_ask, tgt_bid, tgt_ask;

  feed_parser64 u_parse (.clk(clk), .rst(rst),
    .in_valid(in_valid), .in_data(in_data),
    .msg_valid(msg_valid), .msg_inst(msg_inst),
    .msg_side(msg_side), .msg_price(msg_price),
    .msg_size(msg_size));

  top_of_book   u_book (.clk(clk), .rst(rst),
    .msg_valid(msg_valid), .msg_inst(msg_inst),
    .msg_side(msg_side), .msg_price(msg_price),
    .msg_size(msg_size),
    .lead_bid(lead_bid), .lead_ask(lead_ask),
    .tgt_bid(tgt_bid), .tgt_ask(tgt_ask),
    .tgt_bid_sz(tgt_bid_sz), .tgt_ask_sz(tgt_ask_sz));

  trigger       u_trig (.clk(clk), .rst(rst),
    .armed(armed), .threshold(threshold),
    .lead_bid(lead_bid), .lead_ask(lead_ask),
    .tgt_bid(tgt_bid), .tgt_ask(tgt_ask),
    .tgt_bid_sz(tgt_bid_sz), .tgt_ask_sz(tgt_ask_sz),
    .fire(fire), .fire_side(fire_side),
    .fire_price(fire_price), .fire_size(fire_size));

  order_tx64    u_tx   (.clk(clk), .rst(rst),
    .fire(fire), .fire_side(fire_side),
    .fire_price(fire_price), .fire_size(fire_size),
    .out_valid(out_valid), .out_data(out_data));
endmodule
