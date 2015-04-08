var tessel = require('tessel');

function testSpi(clockSpeed, cb) {
	var spi = tessel.ports['A'].SPI({clockSpeed: clockSpeed});
	spi.send(new Buffer([0x01, 0x02, 0x03, 0x04, 0x05]), function(){
		spi.receive(3, function(err, data){
			if (err) console.log("Error on spi receive", err);

			if (data.length != 3) console.log("Error on spi rx, data is not the right length");
			
			spi.transfer(new Buffer([0xDE, 0xAD, 0xBE, 0xEF]), function(err, data){

				if (data.length != 4) console.log("Error on spi txrx, data is not the right length");

				console.log("done with spi js test");
				cb && cb();
			});
		});
	});
}

var testSpeeds = [1e6, 1e4, 1e3];

testSpi(testSpeeds[0], function(){
	testSpi(testSpeeds[1], function(){
		testSpi(testSpeeds[2], function(){
			console.log("done");
		})
	})
})