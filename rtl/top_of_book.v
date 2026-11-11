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
      lead_bid   <= 24'd0;  lead_ask   <= 24'd0;
      tgt_bid    <= 24'd0;  tgt_ask    <= 24'd0;
      tgt_bid_sz <= 16'd0;  tgt_ask_sz <= 16'd0;
    end else if (msg_valid) begin
      if (msg_inst == LEAD && !msg_side) lead_bid <= msg_price;
      if (msg_inst == LEAD &&  msg_side) lead_ask <= msg_price;
      if (msg_inst == TGT  && !msg_side) begin
        tgt_bid    <= msg_price;
        tgt_bid_sz <= msg_size;
      end
      if (msg_inst == TGT  &&  msg_side) begin
        tgt_ask    <= msg_price;
        tgt_ask_sz <= msg_size;
      end
    end
  end
endmodule
