var tessel = require('tessel');
var portB = tessel.port['B'];

var val = 0;

setInterval(function(){
	console.log("dac =", val);
	portB.analog[7].write(val);
	
	if (val < 3.2) {
		val += 0.1;
	} else {
		val = 0;
	}
}, 500);