var usb = require('usb');

var rig = usb.findByIds(0x59E3, 0xCDA6);
rig.open();

var REQ = {
    digital         : 1,
    analog          : 2,
    readAllDigital  : 3,
};

function digital (pin, state, callback) {
    rig.controlTransfer(0xC0, REQ.digital, state, pinId(pin), 64, function(err, data) {
        callback && callback(err, data && data[0]);
    });
}

function readAllDigital (callback) {
    rig.controlTransfer(0xC0, REQ.readAllDigital, 0, 0, 64, function(err, data) {
        if (callback) {
            var state = {};
            if (!err) {
                for (var i = 0; i < digitalPins.length; i++) {
                    state[digitalPins[i]] = !!data[i];
                }
            }
            callback(err, state);
        }
    });
}

function pinId (name) {
    return digitalPins.indexOf(name.toUpperCase());
}

var digitalPins = [
    "SHORT_USBO",
    "SHORT_USB1",
    "SHORT_PORTA33",
    "SHORT_PORTB33",
    "LED_READY",
    "LED_TESTING",
    "LED_PASS",
    "LED_FAIL",
    "UUTPOWER_USB",
    "UUTPOWER_VIN",
    "PORTA_MOSI",
    "PORTA_MISO",
    "PORTA_SCK",
    "PORTA_G3",
    "PORTA_SDA",
    "PORTA_SCL",
    "PORTA_G1",
    "PORTA_G2",
    "PORTB_G3",
    "PORTB_MOSI",
    "PORTB_SCK",
    "PORTB_MISO",
    "PORTB_SDA",
    "PORTB_SCL",
    "PORTB_G1",
    "PORTB_G2",
];

var s = 0;
setInterval(function () {
    digital ("led_pass", s++%3, function (err, data) {
        console.log(err, data);
    });
    readAllDigital(function (err, data) {
        console.log(err);
        console.log(data);
        console.log('\n');
    });
}, 500);