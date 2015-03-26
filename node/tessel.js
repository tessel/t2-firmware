var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Duplex = require('stream').Duplex;
var net = require('net');

function Tessel() {
    if (Tessel.instance) {
        return Tessel.instance;
    } else {
        Tessel.instance = this;
    }
    this.ports = {
        A: new Port('A', '/var/run/tessel/port_a'),
        B: new Port('B', '/var/run/tessel/port_b')
    };
    this.port = this.ports;
}

function Port(name, socketPath) {
    // Connection to the SPI daemon
    this.sock = net.createConnection({path: socketPath}, function(e) {
        if (e) { throw e; }
    });

    this.sock.on('error', function(e) {
        console.log('sock err', e)
    })

    this.sock.on('close', function() {
        throw new Error("Port socket closed");
    })

    this.sock.on('readable', function() {
        while (true) {
            var d = this.sock.read(1);

            if (!d) break;
            var byte = d[0];

            if (byte >= REPLY.MIN_ASYNC) {
                if (byte >= REPLY.ASYNC_PIN_CHANGE_N && byte < REPLY.ASYNC_PIN_CHANGE_N+8) {
                    var pin = this.pin[byte - REPLY.ASYNC_PIN_CHANGE_N];

                    var mode = pin.interruptMode;
                    if (mode == 'low' || mode == 'high') {
                        pin.interruptMode = null;
                    }

                    pin.emit(mode);
                } else {
                    this.emit('async-event', byte);
                }

                continue;
            }

            if (this.replyQueue.length == 0) {
                throw new Error("Received an unexpected response with no commands pending: " + byte);
            }

            var data = null;
            var data_size = this.replyQueue[0].size;

            if (byte == REPLY.DATA) {
                if (!data_size) {
                    throw new Error("Received unexpected data packet");
                }
                data = this.sock.read(data_size);
                if (!data) {
                    this.sock.unshift(data);
                    this.sock.unshift(d);
                    break;
                }
            }

            var q = this.replyQueue.shift();
            if (q.callback) {
                q.callback.call(this, null, q.size ? data : byte);
            }
        }
    }.bind(this));

    // Active peripheral: 'none', 'i2c', 'spi', 'uart'
    this.mode = 'none';

    // Array of {size, callback} used to dispatch replies
    this.replyQueue = [];

    this.pin = [];
    for (var i=0; i<8; i++) {
        this.pin.push(new Pin(i, this, [2,5,6,7].indexOf(i) != -1));
    }

    // Deprecated properties for Tessel 1 backwards compatibility:
    this.pin.G1 = this.pin.g1 = this.pin[5];
    this.pin.G2 = this.pin.g2 = this.pin[6];
    this.pin.G3 = this.pin.g3 = this.pin[7];
    this.digital = [ this.pin[5], this.pin[6], this.pin[7] ];
    this.analog = [];
    this.pwm = [];
}

Port.prototype.cork = function() {
    this.sock.cork();
}

Port.prototype.uncork = function() {
    this.sock.uncork();
}

Port.prototype.sync = function(cb) {
    if (cb) {
        this.sock.write(new Buffer([CMD.ECHO, 1, 0x88]));
        this.replyQueue.push({
            size: 1,
            callback: function(err, data) {
                cb(null);
            }
        });
    }
}

Port.prototype._simple_cmd = function(buf, cb) {
    this.cork()
    this.sock.write(new Buffer(buf))
    this.sync(cb)
    this.uncork()
}

Port.prototype._status_cmd = function(buf, cb) {
    this.sock.write(new Buffer(buf));
    this.replyQueue.push({
        size: 0,
        callback: cb,
    });
}

Port.prototype._tx = function(buf, cb) {
    if (buf.length == 0) {
        throw new Error("Length must be non-zero");
    } else if (buf.length > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.cork();
    this.sock.write(new Buffer([CMD.TX, buf.length]))
    this.sock.write(buf);
    this.sync(cb);
    this.uncork();
}

Port.prototype._rx = function(len, cb) {
    if (len == 0) {
        throw new Error("Length must be non-zero");
    } else if (len > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.sock.write(new Buffer([CMD.RX, len]));
    this.replyQueue.push({
        size: len,
        callback: cb,
    });
}

Port.prototype._txrx = function(buf, cb) {
    if (buf.length == 0) {
        throw new Error("Length must be non-zero");
    } else if (buf.length > 255) {
        // TODO: split into sequence of commands
        throw new Error("Buffer size must be less than 255");
    }

    this.cork();
    this.sock.write(new Buffer([CMD.TXRX, buf.length]))
    this.sock.write(buf);
    this.replyQueue.push({
        size: buf.length(),
        callback: cb,
    });
    this.uncork();
}

Port.prototype.I2C = function (addr, mode) {
    this._simple_cmd([CMD.ENABLE_I2C, 0]);
    return new I2C(addr, this);
};

Port.prototype.SPI = function (format) {
    return new SPI(format == null ? {} : format, this);
};

Port.prototype.UART = function (format) {
    return new UART(this);
};

function Pin (pin, port, interruptSupported) {
    this.pin = pin;
    this._port = port;
    this.interruptSupported = interruptSupported;
    this.interruptMode = null;
    this.isPWM = false;
}

util.inherits(Pin, EventEmitter);

Pin.interruptModes = {
  "rise" : 1,
  "fall" : 2,
  "change" : 3,
  "high" : 4,
  "low" : 5,
};

Pin.prototype.removeListener = function(event, listener) {
    // If it's an interrupt event, remove as necessary
    var emitter = Pin.super_.prototype.removeListener.apply(this, arguments);

    if (event == this.interruptMode && EventEmitter.listenerCount(this, event)) {
        this._setInterruptMode(null);
    }

    return emitter;
};

Pin.prototype.removeAllListeners = function(event) {
    if (!event || event == this.interruptMode) {
        this._setInterruptMode(null);
    }

    return Pin.super_.prototype.removeAllListeners.apply(this, arguments);
};

Pin.prototype.addListener = function(mode, callback) {
    if (mode in Pin.interruptModes) {
        if (!this.interruptSupported) {
            throw new Error("Interrupts are not supported on pin " + this.pin)
        }

        if ((mode == 'high' || mode == 'low') && !callback.listener) {
            throw new Error("Cannot use 'on' with level interrupts. You can only use 'once'.");
        }

        if (this.interruptMode != mode) {
            if (this.interruptMode) {
                throw new Error("Can't set pin interrupt mode to " + mode
                                + "; already listening for " + this.interruptMode);
            }
            this._setInterruptMode(mode);
        }
    }

    // Add the event listener
    Pin.super_.prototype.on.call(this, mode, callback);
};
Pin.prototype.on = Pin.prototype.addListener;

Pin.prototype._setInterruptMode = function(mode) {
    this.interruptMode = mode;
    var bits = mode ? Pin.interruptModes[mode] << 4 : 0;
    this._port._simple_cmd([CMD.GPIO_INT, this.pin | bits]);
};

Pin.prototype.high = function(cb) {
    this._port._simple_cmd([CMD.GPIO_HIGH, this.pin], cb);
    return this;
}

Pin.prototype.low = function(cb) {
    this._port._simple_cmd([CMD.GPIO_LOW, this.pin], cb);
    return this;
}

Pin.prototype.toggle = function(cb) {
    this._port._simple_cmd([CMD.GPIO_TOGGLE, this.pin], cb);
    return this;
}

Pin.prototype.output = function output(initialValue, cb) {
    if (initialValue) {
        this.high(cb);
    } else {
        this.low(cb);
    }
    return this;
}

function I2C(addr, port) {
    this.addr = addr;
    this._port = port;
}

I2C.prototype.send = function(data, callback) {
    this._port.cork();
    this._port._simple_cmd([CMD.START, this.addr << 1]);
    this._port._tx(data);
    this._port._simple_cmd([CMD.STOP], callback);
    this._port.uncork();
}

I2C.prototype.read = function(length, callback) {
    this._port.cork();
    this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    this._port._rx(length, callback);
    this._port._simple_cmd([CMD.STOP]);
    this._port.uncork();
}

I2C.prototype.transfer = function(txbuf, rxlen, callback) {
    this._port.cork();
    if (txbuf.length > 0) {
        this._port._simple_cmd([CMD.START, this.addr << 1]);
        this._port._tx(txbuf);
    }
    this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    this._port._rx(rxlen, callback);
    this._port._simple_cmd([CMD.STOP]);
    this._port.uncork();
}

function SPI(params, port) {
    this._port = port;
    // default to pin 3 of the module port as cs
    this.chipSelect = params.chipSelect || this._port.digital[5];

    this.chipSelectActive = params.chipSelectActive == 'high' || params.chipSelectActive == 1 ? 1 : 0;

    if (this.chipSelectActive) {
        // active high, pull low for now
        this.chipSelect.low();
    } else {
        // active low, pull high for now
        this.chipSelect.high();
    }

    /* spi baud rate is set by the following equation:
    *  f_baud = f_ref/(2*(baud_reg+1))
    *  max baud rate is 24MHz for the SAMD21
    */
    // default is 2MHz
    params.clockSpeed = params.clockSpeed ? params.clockSpeed : 2e6;

    if (params.clockSpeed > 24e6 || params.clockSpeed < 93750) {
        throw new Error('SPI Clock needs to be between 24e6 and 93750Hz.');
    }

    this.clockReg = parseInt(48e6/(2*params.clockSpeed) - 1);
    
    if (typeof params.dataMode == 'number') {
        params.cpol = params.dataMode & 0x1;
        params.cpha = params.dataMode & 0x2;
    }

    this.cpol = params.cpol == 'high' || params.cpol == 1 ? 1 : 0;
    this.cpha = params.cpha == 'second' || params.cpha == 1 ? 1 : 0;

    this._port._simple_cmd([CMD.ENABLE_SPI, this.cpol + (this.cpha << 1), this.clockReg]);
}

SPI.prototype.send = function(data, callback) {
    // cork/uncork?
    // pull cs low
    console.log("pulling pin 5 low");
    this.chipSelect.toggle();

    this._port._tx(data);
    
    console.log("transmitted data");
    
    this.chipSelect.toggle();
}

SPI.prototype.deinit = function(){
    this._port._simple_cmd([CMD.CMD_DISABLE_SPI]);
}

SPI.prototype.receive = function(data_len, callback) {
    this.chipSelect.toggle();
    // console.log("pulling pin 5 low");
    this._port._rx(data_len, callback);
    
    this.chipSelect.toggle();
}

SPI.prototype.transfer = function(data, callback) {
    this.chipSelect.toggle();
    
    // console.log("pulling pin 5 low");
    this._port._txrx(data, callback);
    this.chipSelect.toggle();
}

function UART(port) {
    throw new Error("Unimplemented")
}

var CMD = {
    NOP: 0,
    FLUSH: 1,
    ECHO: 2,
    GPIO_IN: 3,
    GPIO_HIGH: 4,
    GPIO_LOW: 5,
    GPIO_TOGGLE: 21,
    GPIO_CFG: 6,
    GPIO_WAIT: 7,
    GPIO_INT: 8,
    ENABLE_SPI: 10,
    DISABLE_SPI: 11,
    ENABLE_I2C: 12,
    DISABLE_I2C: 13,
    ENABLE_UART: 14,
    DISABLE_UART: 15,
    TX: 16,
    RX: 17,
    TXRX: 18,
    START: 19,
    STOP: 20,
};

var REPLY = {
    ACK:  0x80,
    NACK: 0x81,
    HIGH: 0x82,
    LOW:  0x83,
    DATA: 0x84,

    MIN_ASYNC: 0xA0,
    ASYNC_PIN_CHANGE_N: 0xC0,
};

var SPISettings = {
    CPOL: 1,
    CPHA: 2
};

module.exports = new Tessel();
