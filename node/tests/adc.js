var tessel = require('tessel');
var portA = tessel.port['A'];
var portB = tessel.port['B'];

// read some values
setInterval(function(){
	portA.pin[4].analogRead(function(err, data){
		console.log("port a pin 4", data);
	});

	portA.pin[7].analogRead(function(err, data){
		console.log("port a pin 7", data);
	});

	portB.pin[3].analogRead(function(err, data){
		console.log("port b pin 3", data);
	});
}, 500);