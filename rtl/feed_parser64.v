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
    msg_valid <= !rst && in_valid && (in_data[63:56] == 8'h51);
    if (in_valid) begin
      msg_inst  <= in_data[55:48];
      msg_side  <= (in_data[47:40] == 8'h53);
      msg_price <= in_data[39:16];
      msg_size  <= in_data[15:0];
    end
  end
endmodule
