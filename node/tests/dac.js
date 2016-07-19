var tessel = require('tessel');
var portB = tessel.port['B'];

var val = 0;

setInterval(function(){
	console.log("dac =", val);
	portB.pin[7].analogWrite(val);

	if (val < 0.95) {
		val += 0.05;
	} else {
		val = 0;
	}
}, 500);
