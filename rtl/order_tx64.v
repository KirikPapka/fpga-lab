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
    out_valid <= fire && !rst;
    if (fire)
      out_data <= {8'h4F, 8'h02, (fire_side ? 8'h53 : 8'h42),
                   fire_price, fire_size};
  end
endmodule
