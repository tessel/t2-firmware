var tessel = require('tessel');
var uart = tessel.port['A'].UART();
var uartb = tessel.port['B'].UART();

uart.on('data', function(data){
  console.log("RX:", data.toString());
});

uartb.on('data', function(data){
  console.log("B RX:", data.toString());
})

uart.write("one two three four");
uartb.write("one two three four");

uart.write("12345");
uartb.write("12345");

setTimeout(function() {
  uart.write("11 12 13 14 15 16 17 18 19 20");
  uart.write("this sentence is longer than thirty characters all sending at once. just want to make it a bit longer so that it has to wrap around the buffer about twice or maybe even three times.");
  uartb.write("11 12 13 14 15 16 17 18 19 20");
  uartb.write("this sentence is longer than thirty characters all sending at once. just want to make it a bit longer so that it has to wrap around the buffer about twice or maybe even three times.");

}, 100);