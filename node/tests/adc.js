var tessel = require('tessel');
var portA = tessel.port['A'];

// read some values
setInterval(function(){
	portA.analog[0].read(function(err, data){
		console.log("port a pin 4", data);
	});

	portA.analog[1].read(function(err, data){
		console.log("port a pin 7", data);
	});
}, 500);