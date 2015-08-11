var Tessel = require('tessel-export');

var tessel = new Tessel({
  ports: {
    B: false
  }
});

console.log(tessel.ports.B === null);

tessel.ports.A.pin[2].high();
