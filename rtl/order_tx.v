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
      out_valid <= 1'b0;
      left      <= 4'd0;
    end else if (fire && left == 0) begin
      out_valid <= 1'b1;
      out_data  <= 8'h4F;                  // 'O' new order
      shreg     <= {8'h02, (fire_side ? 8'h53 : 8'h42),
                    fire_price, fire_size, 8'h00};
      left      <= 4'd7;
    end else if (left != 0) begin
      out_valid <= 1'b1;
      out_data  <= shreg[63:56];
      shreg     <= {shreg[55:0], 8'h00};
      left      <= left - 4'd1;
    end else begin
      out_valid <= 1'b0;
    end
  end
endmodule
