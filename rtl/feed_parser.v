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
      idx <= 3'd0;
    end else if (in_valid) begin
      idx <= idx + 3'd1;
      case (idx)
        3'd0: typ              <= in_data;
        3'd1: msg_inst         <= in_data;
        3'd2: msg_side         <= (in_data == 8'h53);
        3'd3: msg_price[23:16] <= in_data;
        3'd4: msg_price[15:8]  <= in_data;
        3'd5: msg_price[7:0]   <= in_data;
        3'd6: msg_size[15:8]   <= in_data;
        3'd7: begin
          msg_size[7:0] <= in_data;
          msg_valid     <= (typ == 8'h51);  // 'Q'
        end
      endcase
    end
  end
endmodule
