var tessel = require('tessel');
var portA = tessel.port.A;
var portB = tessel.port.B;

[2, 5, 6, 7].forEach(function(index) {
  portA.pin[index].low();
  portA.pin[index].once('high', function() {
    console.log('(A) Pin: %d went high!', index);
  });

  portB.pin[index].low();
  portB.pin[index].once('high', function() {
    console.log('(B) Pin: %d went high!', index);
  });
});
