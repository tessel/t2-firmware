var usb = require('usb');
var Duplex = require('stream').Duplex;
var util = require('util');

function UsbStream(epIn, epOut) {
    Duplex.call(this);
    this.epIn = epIn;
    this.epOut = epOut;
}
util.inherits(UsbStream, Duplex);

UsbStream.prototype._read = function() {
    var self = this;
    self.epIn.transfer(4096, function(err, data) {
        if (err) {
            self.emit('error', err);
        } else {
            self.push(data);
        }
    });
}

UsbStream.prototype._write = function(chunk, encoding, callback) {
    var self = this;
    self.epOut.transfer(chunk, callback);
}

function Tessel2() {
    this.usb = usb.findByIds(0x1209, 0x7551);
    if (!this.usb) throw new Error("Device not found");
}

Tessel2.prototype.open = function(next) {
    var self = this;
    this.usb.open();

    self.intf = self.usb.interface(0);
    try {
        self.intf.claim();
    } catch (e) {
        if (e.message === 'LIBUSB_ERROR_BUSY') {
            e = "Device is in use by another process";
        }
        return next(e);
    }

    self.intf.setAltSetting(2, function(error) {
        if (error) return next(error);
        self.stream = new UsbStream(self.intf.endpoints[0], self.intf.endpoints[1]);
        next();
    });
}

t2 = new Tessel2();
t2.open(function(err) {
    if (err) throw err;

    t2.stream.write("Hello Tessel");
    t2.stream.pipe(process.stdout);
});
