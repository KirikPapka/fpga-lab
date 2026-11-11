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
  wire buy  = book_ok && (lead_bid >= tgt_ask + threshold);
  // LEAD fell below TGT's bid: that bid is stale, sell to it.
  wire sell = book_ok && (lead_ask + threshold <= tgt_bid);
  wire opp  = buy || sell;
  reg  opp_q;                     // opp one cycle ago

  always @(posedge clk) begin
    if (rst) begin
      opp_q <= 1'b0;
      fire  <= 1'b0;
    end else begin
      opp_q      <= opp;
      fire       <= armed && opp && !opp_q;  // new ones only
      fire_side  <= sell;
      fire_price <= buy ? tgt_ask    : tgt_bid;
      fire_size  <= buy ? tgt_ask_sz : tgt_bid_sz;
    end
  end
endmodule
