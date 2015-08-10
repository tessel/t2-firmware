process.env.TESSEL_EXPORT_UNINITIALIZED = true;

var Tessel = require('tessel');

var tessel = new Tessel({
  ports: {
    B: false
  }
});

console.log(tessel.ports.B === null);

tessel.ports.A.pin[2].high();
