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
      count <= 4'd0;
      a     <= 1'b0;
      b     <= 1'b0;
    end else begin
      if (en) count <= count + 4'd1;
      a <= d_in;
      b <= a;  // reads the OLD a
    end
  end
endmodule
