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
            if (byte == REPLY.ASYNC_UART_RX) {
                // get the next byte which is the number of bytes
                var rxNum = this.sock.read(1)[0];
                var rxData = this.sock.read(rxNum);

                // if rxNum is bad or if we don't have enough data, wait until next cycle
                if (!rxNum || !rxData) {
                    this.sock.unshift(rxNum);
                    this.sock.unshift(d);
                    continue;
                }

                if (this._uart) {
                    this._uart.push(rxData.toString());
                }
                continue;
            }

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
                    // if there's a partial reply, 
                    // wait until we get the full data
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
        size: buf.length,
        callback: cb,
    });
    this.uncork();
}

Port.prototype.I2C = function (addr, mode) {
    if (!this._i2c) {
        params = {addr: addr, mode:mode};
        this._i2c = new I2C(params, this);
    }
    return this._i2c;
};

Port.prototype.SPI = function (format) {
    if (!this._spi) {
        this._spi = new SPI(format == null ? {} : format, this);
    }
    return this._spi;
};

Port.prototype.UART = function (format) {
    if (!this._uart) {
        this._uart = new UART(this, format || {});
    }
    return this._uart;
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

// Deprecated. Added for tessel 1 lib compat
Pin.prototype.rawWrite = function(value){
    if (value) {
        this.high();
    } else {
        this.low();
    }
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

function I2C(params, port) {
    this.addr = params.addr;
    this._port = port;
    this._freq = params.freq ? params.freq : 100000; // 100khz

    // 15ns is max scl rise time
    // f = (48e6)/(2*(5+baud)+48e6*1.5e-8)
    this._baud = Math.floor(((48e6/this._freq) - 48e6*(1.5e-8))/2 - 5);
    if (this._baud > 255 || this._baud <= 0 || this._freq > 4e5) {
        // restrict to between 400khz and 90khz. can actually go up to 4mhz without clk modification
        throw new Error('I2C frequency should be between 400khz and 90khz');
    }
    // enable i2c 
    this._port._simple_cmd([CMD.ENABLE_I2C, this._baud]);
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
    // default to pin 5 of the module port as cs
    this.chipSelect = params.chipSelect || this._port.digital[0];

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
    *  max baud rate is 24MHz for the SAMD21, min baud rate is 93750 without a clock divisor
    *  with a max clock divisor of 255, slowest clock is 368Hz unless we switch from 48MHz xtal to 32KHz xtal
    */
    // default is 2MHz
    params.clockSpeed = params.clockSpeed ? params.clockSpeed : 2e6;

    // if speed is slower than 93750 then we need a clock divisor
    if (params.clockSpeed > 24e6 || params.clockSpeed < 368) {
        throw new Error('SPI Clock needs to be between 24e6 and 368Hz.');
    }

    this.clockReg = Math.floor(48e6/(2*params.clockSpeed) - 1);

    // find the smallest clock divider such that clockReg is <=255
    if (this.clockReg > 255) {
        // find the clock divider, make sure its at least 1
        this._clockDiv = Math.floor(48e6/(params.clockSpeed*(2*255+2))) || 1;

        // if the speed is still too low, set the clock divider to max and set baud accordingly
        if (this._clockDiv > 255) {
            this.clockReg = Math.floor(this.clockReg/255) || 1; 
            this._clockDiv = 255;
        } else {
            // if we can set a clock divider <255, max out clockReg
            this.clockReg = 255;
        }
    } else {
        this._clockDiv = 1;
    }
    
    if (typeof params.dataMode == 'number') {
        params.cpol = params.dataMode & 0x1;
        params.cpha = params.dataMode & 0x2;
    }

    this.cpol = params.cpol == 'high' || params.cpol == 1 ? 1 : 0;
    this.cpha = params.cpha == 'second' || params.cpha == 1 ? 1 : 0;

    this._port._simple_cmd([CMD.ENABLE_SPI, this.cpol + (this.cpha << 1), this.clockReg, this._clockDiv]);
}

SPI.prototype.send = function(data, callback) {
    this._port.cork();
    this.chipSelect.low();
    this._port._tx(data, callback);
    this.chipSelect.high();
    this._port.uncork();
}

SPI.prototype.deinit = function(){
    this._port._simple_cmd([CMD.CMD_DISABLE_SPI]);
}

SPI.prototype.receive = function(data_len, callback) {
    this._port.cork();
    this.chipSelect.low();
    this._port._rx(data_len, callback);
    this.chipSelect.high();
    this._port.uncork();
}

SPI.prototype.transfer = function(data, callback) {
    this._port.cork();
    this.chipSelect.low();
    this._port._txrx(data, callback);
    this.chipSelect.high();
    this._port.uncork();
}

function UART(port, options) {
    Duplex.call(this, {});

    this._port = port;
    
    // baud is given by the following:
    // baud = 65536*(1-(samples_per_bit)*(f_wanted/f_ref))
    // samples_per_bit = 16, 8, or 3
    // f_ref = 48e6
    this._baudrate = options.baudrate || 9600;
    // make sure baudrate is in between 9600 and 115200
    if (this._baudrate < 9600 || this._baudrate > 115200) {
        throw new Error("UART baudrate must be between 9600 and 115200");
    }
    this._baud = Math.floor(65536*(1-16*(this._baudrate/48e6)));

    // split _baud up into two bytes & send
    this._port._simple_cmd([CMD.ENABLE_UART, this._baud >> 8, this._baud & 0xFF]);

    this.enabled = true;
}

util.inherits(UART, Duplex);

UART.prototype._write = function(chunk, encoding, cb) {
    // throw an error if not enabled
    if (!this.enabled) {
        throw new Error("UART is not enabled on this port");
    }
    this._port._tx(chunk, cb);
}

UART.prototype._read = function() {}

UART.prototype.disable = function() {
    this._port._simple_cmd([CMD.DISABLE_UART, 0, 0]);
    this.enabled = false;
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
    ASYNC_PIN_CHANGE_N: 0xC0, // c0 to c8 is all async pin assignments
    ASYNC_UART_RX: 0xD0
};

var SPISettings = {
    CPOL: 1,
    CPHA: 2
};

module.exports = new Tessel();
