var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Duplex = require('stream').Duplex;
var net = require('net');
var fs = require('fs');
var childProcess = require('child_process');

var defOptions = {
  ports: {
    A: true,
    B: true,
  }
};

// Maximum number of ticks before period completes
const PWM_MAX_PERIOD = 0xFFFF;
// Actual lowest frequency is ~0.72Hz but 1Hz is easier to remember.
// 5000 is the max because any higher and the resolution drops
// below 7% (0xFFFF/5000 ~ 7.69) which is confusing
const PWM_MAX_FREQUENCY = 5000;
const PWM_MIN_FREQUENCY = 1;
const PWM_PRESCALARS = [1, 2, 4, 8, 16, 64, 256, 1024];
// Maximum number of unscaled ticks in a second (48 MHz)
const SAMD21_TICKS_PER_SECOND = 48000000;

function Tessel(options) {
  if (Tessel.instance) {
    return Tessel.instance;
  } else {
    Tessel.instance = this;
  }

  // If the user program has provided a _valid_ options object, or use default
  options = typeof options === 'object' && options !== null ? options : defOptions;

  // If the user program has passed an options object that doesn't
  // contain a `ports` property, or the value of the `ports` property
  // is null or undefined: use the default.
  if (options.ports == null) {
    options.ports = defOptions.ports;
  }

  // For compatibility with T1 code, ensure that all ports are initialized by default.
  // This means that only an explicit `A: false` or `B: false` will result in a
  // port not being initialized. If the property is not present, null or undefined,
  // it will be set to `true`.
  //
  // ONLY a value of `false` can prevent the port from being initialized!
  //
  if (options.ports.A == null) {
    options.ports.A = true;
  }

  if (options.ports.B == null) {
    options.ports.B = true;
  }

  this.ports = {
    A: options.ports.A ? new Tessel.Port('A', Tessel.Port.PATH.A, this) : null,
    B: options.ports.B ? new Tessel.Port('B', Tessel.Port.PATH.B, this) : null,
  };

  this.port = this.ports;

  this.led = new Tessel.LEDs([{
    color: 'red',
    type: 'error'
  }, {
    color: 'amber',
    type: 'wlan'
  }, {
    color: 'green',
    type: 'user1'
  }, {
    color: 'blue',
    type: 'user2'
  }, ]);

  this.leds = this.led;

  this.network = {
    wifi: new Tessel.Wifi(),
    ap: new Tessel.AP()
  };

  // tessel v1 does not have this version number
  // this is useful for libraries to adapt to changes
  // such as all pin reads/writes becoming async in version 2
  this.version = 2;
}

var pwmBankSettings = {
  period: 0,
  prescalarIndex: 0,
};

Tessel.prototype.close = function() {
  ['A', 'B'].forEach(function(name) {
    if (this.port[name]) {
      this.port[name].sock.destroy();
    }
  }, this);
};

Tessel.prototype.pwmFrequency = function(frequency, cb) {
  if (frequency < PWM_MIN_FREQUENCY || frequency > PWM_MAX_FREQUENCY) {
    throw new RangeError(`pwmFrequency value must be between ${PWM_MIN_FREQUENCY} and ${PWM_MAX_FREQUENCY}`);
  }

  var results = determineDutyCycleAndPrescalar(frequency);

  pwmBankSettings.period = results.period;
  pwmBankSettings.prescalarIndex = results.prescalarIndex;

  // We are currently only using TCC Bank 0
  // This may be expanded in the future to enable PWM on more pins
  const TCC_ID = 0;

  var packet = new Buffer(4);
  // Write the command id first
  packet.writeUInt8(CMD.PWM_PERIOD, 0);
  // Write our prescalar to the top 4 bits and TCC id to the bottom 4 bits
  packet.writeUInt8((pwmBankSettings.prescalarIndex << 4) | TCC_ID, 1);
  // Write our period (16 bits)
  packet.writeUInt16BE(pwmBankSettings.period, 2);

  // Send the packet off to the samd21
  // on the first available port object (regardless of name)
  this.port[['A', 'B'].find(name => this.ports[name] !== null)].sock.write(packet, cb);
};

/*
 Takes in a desired frequency setting and outputs the
 necessary prescalar and duty cycle settings based on set period.
 Outputs an object in the form of:
 {
  prescalar: number (0-7),
  period: number (0-0xFFFF)
 }
*/
function determineDutyCycleAndPrescalar(frequency) {
  // Current setting for the prescalar
  var prescalarIndex = 0;
  // Current period setting
  var period = 0;

  // If the current frequency would require a period greater than the max
  while ((period = Math.floor((SAMD21_TICKS_PER_SECOND / PWM_PRESCALARS[prescalarIndex]) / frequency)) > PWM_MAX_PERIOD) {
    // Increase our clock prescalar
    prescalarIndex++;

    // If we have no higher prescalars
    if (prescalarIndex === PWM_PRESCALARS.length) {
      // Throw an error because this frequency is too low for our possible parameters
      throw new Error('Unable to find prescalar/duty cycle parameter match for frequency');
    }
  }

  // We have found a period inside a suitable prescalar, return results
  return {
    period: period,
    prescalarIndex: prescalarIndex
  };
}

Tessel.Port = function(name, socketPath, board) {
  var port = this;

  this.name = name;
  this.board = board;
  // Connection to the SPI daemon
  this.sock = net.createConnection({
    path: socketPath
  }, function(e) {
    if (e) {
      throw e;
    }
  });

  // Number of tasks occupying the socket
  this._pendingTasks = 0;

  // Unreference this socket so that the script will exit
  // if nothing else is waiting in the event queue.
  this.unref();

  this.sock.on('error', function(e) {
    console.log('we had a socket err', e);
  });

  this.sock.on('end', function() {
    console.log('the other socket end closed!');
  });

  this.sock.on('close', function() {
    throw new Error('Port socket closed');
  });

  var replyBuf = new Buffer(0);

  this.sock.on('readable', function() {
    var queued;
    // This value can potentially be `null`.
    var available = new Buffer(this.sock.read() || 0);

    // Copy incoming data into the reply buffer
    replyBuf = Buffer.concat([replyBuf, available]);

    // While we still have data to process in the buffer
    while (replyBuf.length !== 0) {
      // Grab the next byte
      var byte = replyBuf[0];
      // If the next byte equals the marker for a uart incoming
      if (byte === REPLY.ASYNC_UART_RX) {
        // Get the next byte which is the number of bytes
        var rxNum = replyBuf[1];
        // As long as the number of butes of rx buffer exists
        // and we have at least the number of bytes needed for a uart rx packet
        if (rxNum !== undefined && replyBuf.length >= 2 + rxNum) {
          // Read the incoming data
          var rxData = replyBuf.slice(2, 2 + rxNum);
          // Cut those bytes out of the reply buf packet so we don't
          // process them again
          replyBuf = replyBuf.slice(2 + rxNum);

          // If a uart port was instantiated
          if (this._uart) {
            // Push this data into the buffer
            this._uart.push(rxData.toString());
          }
          // Something went wrong and the packet is malformed
        } else {
          break;
        }
        // This is some other async transaction
      } else if (byte >= REPLY.MIN_ASYNC) {
        // If this is a pin change
        if (byte >= REPLY.ASYNC_PIN_CHANGE_N && byte < REPLY.ASYNC_PIN_CHANGE_N + 16) {
          // Pull out the pin number (requires clearing the value bit)
          var pin = this.pin[(byte - REPLY.ASYNC_PIN_CHANGE_N) & ~(1 << 3)];
          // Get the mode change
          var mode = pin.interruptMode;
          // Get the pin value
          var pinValue = (byte >> 3) & 1;

          // For one-time 'low' or 'high' event
          if (mode === 'low' || mode === 'high') {
            pin.emit(mode);
            // Reset the pin interrupt state (prevent constant interrupts)
            pin.interruptMode = null;
            // Decrement the number of tasks waiting on the socket
            this.unref();
          } else {
            // Emit the change and rise or fall
            pin.emit('change', pinValue);
            pin.emit(pinValue ? 'rise' : 'fall');
          }

        } else {
          // Some other async event
          this.emit('async-event', byte);
        }

        // Cut this byte off of the reply buffer
        replyBuf = replyBuf.slice(1);
      } else {
        // If there are no commands awaiting a response
        if (this.replyQueue.length === 0) {
          // Throw an error... something went wrong
          throw new Error('Received unexpected response with no commands pending: ' + byte);
        }

        // Get the size if the incoming packet
        var size = this.replyQueue[0].size;

        // If we have reply data
        if (byte === REPLY.DATA) {
          // Ensure that the packet size agrees
          if (!size) {
            throw new Error('Received unexpected data packet');
          }

          // The number of data bytes expected have been received.
          if (replyBuf.length >= 1 + size) {
            // Extract the data
            var data = replyBuf.slice(1, 1 + size);
            // Slice this data off of the buffer
            replyBuf = replyBuf.slice(1 + size);
            // Get the  queued command
            queued = this.dequeue();

            // If there is a callback for th ecommand
            if (queued.callback) {
              // Return the data in the callback
              queued.callback.call(this, null, queued.size ? data : byte);
            }
          } else {
            // The buffer does not have the correct number of
            // date bytes to fulfill the requirements of the
            // reply queue's next registered handler.
            break;
          }
          // If it's just one byte being returned
        } else if (byte === REPLY.HIGH || byte === REPLY.LOW) {
          // Slice it off
          replyBuf = replyBuf.slice(1);
          // Get the callback in the queue
          queued = this.dequeue();

          // If a callback was provided
          if (queued.callback) {
            // Return the byte in the callback
            queued.callback.call(this, null, byte);
          }
        }
      }
    }
  }.bind(this));

  // Active peripheral: 'none', 'i2c', 'spi', 'uart'
  this.mode = 'none';

  // Array of {size, callback} used to dispatch replies
  this.replyQueue = [];

  this.pin = [];
  for (var i = 0; i < 8; i++) {
    var interruptSupported = Tessel.Pin.interruptCapablePins.indexOf(i) !== -1;
    var adcSupported = (name === 'B' || Tessel.Pin.adcCapablePins.indexOf(i) !== -1);
    var pullSupported = Tessel.Pin.pullCapablePins.indexOf(i) !== -1;
    var pwmSupported = Tessel.Pin.pwmCapablePins.indexOf(i) !== -1;
    this.pin.push(new Tessel.Pin(i, this, interruptSupported, adcSupported, pullSupported, pwmSupported));
  }

  // Deprecated properties for Tessel 1 backwards compatibility:
  this.pin.G1 = this.pin.g1 = this.pin[5];
  this.pin.G2 = this.pin.g2 = this.pin[6];
  this.pin.G3 = this.pin.g3 = this.pin[7];
  this.digital = [this.pin[5], this.pin[6], this.pin[7]];

  this.pwm = [this.pin[5], this.pin[6]];

  this.I2C = function I2CInit(address) {
    var options = {};

    if (typeof address === 'object' && address != null) {
      /*
        {
          addr: address,
          freq: frequency,
          port: port,
        }
      */
      Object.assign(options, address);
    } else {
      /*
        (address)
      */
      options.address = address;
    }

    /*
      Always ensure that the options
      object contains a port property
      with this port as its value.
    */
    if (!options.port) {
      options.port = port;
    } else {
      /*
        When receiving an object containing
        options information, it's possible that
        the calling code accidentally sends
        a "port" that isn't this port.
      */
      if (options.port !== port) {
        options.port = port;
      }
    }

    return new Tessel.I2C(options);
  };

  this.I2C.enabled = false;

  this.SPI = function SPIInit(format) {
    if (port._spi) {
      port._spi.disable();
    }

    port._spi = new Tessel.SPI(format === null ? {} : format, port);

    return port._spi;
  };

  this.UART = function UARTInit(format) {
    if (port._uart) {
      port._uart.disable();
    }

    port._uart = new Tessel.UART(port, format || {});
    // Grab a reference to this socket so it doesn't close
    // if we're waiting for UART data
    port.ref();

    return port._uart;
  };
};

util.inherits(Tessel.Port, EventEmitter);

Tessel.Port.prototype.ref = function() {
  // Increase the number of pending tasks
  this._pendingTasks++;
  // Ensure this socket stays open until unref'ed
  this.sock.ref();
};

Tessel.Port.prototype.unref = function() {
  // If we have pending tasks to complete
  if (this._pendingTasks > 0) {
    // Subtract the one that is being unref'ed
    this._pendingTasks--;
  }

  // If this was the last task
  if (this._pendingTasks === 0) {
    // Unref the socket so the process doesn't hang open
    this.sock.unref();
  }
};

Tessel.Port.prototype.enqueue = function(reply) {
  this.ref();
  this.replyQueue.push(reply);
};


Tessel.Port.prototype.dequeue = function() {
  this.unref();
  return this.replyQueue.shift();
};

Tessel.Port.prototype.cork = function() {
  this.sock.cork();
};

Tessel.Port.prototype.uncork = function() {
  this.sock.uncork();
};

Tessel.Port.prototype.sync = function(cb) {
  if (cb) {
    this.sock.write(new Buffer([CMD.ECHO, 1, 0x88]));
    this.enqueue({
      size: 1,
      callback: cb
    });
  }
};

Tessel.Port.prototype._simple_cmd = function(buf, cb) {
  this.cork();
  this.sock.write(new Buffer(buf));
  this.sync(cb);
  this.uncork();
};

Tessel.Port.prototype._status_cmd = function(buf, cb) {
  this.sock.write(new Buffer(buf));
  this.enqueue({
    size: 0,
    callback: cb,
  });
};

Tessel.Port.prototype._tx = function(buf, cb) {
  var offset = 0,
    chunk;

  if (buf.length === 0) {
    throw new RangeError('Buffer size must be non-zero');
  }

  this.cork();

  // The protocol only supports <256 byte transfers, chunk if buf is bigger
  while (offset < buf.length) {
    chunk = buf.slice(offset, offset + 255);

    this.sock.write(new Buffer([CMD.TX, chunk.length]));
    this.sock.write(chunk);

    offset += 255;
  }

  this.sync(cb);
  this.uncork();
};

Tessel.Port.prototype._rx = function(len, cb) {
  if (len === 0 || len > 255) {
    throw new RangeError('Buffer size must be within 1-255');
  }

  this.sock.write(new Buffer([CMD.RX, len]));
  this.enqueue({
    size: len,
    callback: cb,
  });
};

Tessel.Port.prototype._txrx = function(buf, cb) {
  var len = buf.length;

  if (len === 0 || len > 255) {
    throw new RangeError('Buffer size must be within 1-255');
  }

  this.cork();
  this.sock.write(new Buffer([CMD.TXRX, len]));
  this.sock.write(buf);
  this.enqueue({
    size: len,
    callback: cb,
  });
  this.uncork();
};

Tessel.Port.PATH = {
  'A': '/var/run/tessel/port_a',
  'B': '/var/run/tessel/port_b'
};

Tessel.Pin = function(pin, port, interruptSupported, analogSupported, pullSupported, pwmSupported) {
  this.pin = pin;
  this._port = port;
  this.interruptSupported = interruptSupported || false;
  this.analogSupported = analogSupported || false;
  this.pullSupported = pullSupported || false;
  this.pwmSupported = pwmSupported || false;
  this.interruptMode = null;
  this.isPWM = false;
};

util.inherits(Tessel.Pin, EventEmitter);

Tessel.Pin.adcCapablePins = [4, 7];
Tessel.Pin.pullCapablePins = [2, 3, 4, 5, 6, 7];
Tessel.Pin.interruptCapablePins = [2, 5, 6, 7];
Tessel.Pin.pwmCapablePins = [5, 6];

Tessel.Pin.interruptModes = {
  rise: 1,
  fall: 2,
  change: 3,
  high: 4,
  low: 5,
};

Tessel.Pin.pullModes = {
  pulldown: 0,
  pullup: 1,
  none: 2,
};

Tessel.Pin.prototype.removeListener = function(event, listener) {
  // If it's an interrupt event, remove as necessary
  var emitter = Tessel.Pin.super_.prototype.removeListener.call(this, event, listener);

  if (event === this.interruptMode && this.listenerCount(event) === 0) {
    this._setInterruptMode(null);
  }

  return emitter;
};

Tessel.Pin.prototype.removeAllListeners = function(event) {
  if (!event || event === this.interruptMode) {
    this._setInterruptMode(null);
  }

  return Tessel.Pin.super_.prototype.removeAllListeners.apply(this, arguments);
};

Tessel.Pin.prototype.addListener = function(mode, callback) {
  // Check for valid pin event mode
  if (typeof Tessel.Pin.interruptModes[mode] !== 'undefined') {
    if (!this.interruptSupported) {
      throw new Error(`Interrupts are not supported on pin ${this.pin}. Pins 2, 5, 6, and 7 on either port support interrupts.`);
    }

    // For one-time 'low' or 'high' event
    if ((mode === 'low' || mode === 'high') && !callback.listener) {
      throw new Error('Cannot use "on" with level interrupts. You can only use "once".');
    }

    // Can't set multiple listeners when using 'low' or 'high'
    if (this.interruptMode) {
      var singleEventModes = ['low', 'high'];
      if (singleEventModes.some(value => mode === value || this.interruptMode === value)) {
        throw new Error(`Cannot set pin interrupt mode to "${mode}"; already listening for "${this.interruptMode}". Can only set multiple listeners with "change", "rise" & "fall".`);
      }
    }

    // Set the socket reference so the script doesn't exit
    this._port.ref();
    this._setInterruptMode(mode);

    // Add the event listener
    Tessel.Pin.super_.prototype.on.call(this, mode, callback);
  } else {
    throw new Error(`Invalid pin event mode "${mode}". Valid modes are "change", "rise", "fall", "high" and "low".`);
  }
};
Tessel.Pin.prototype.on = Tessel.Pin.prototype.addListener;

Tessel.Pin.prototype._setInterruptMode = function(mode) {
  // rise and fall events will be emitted by change event
  this.interruptMode = (mode === 'rise' || mode === 'fall') ? 'change' : mode;
  var bits = mode ? Tessel.Pin.interruptModes[mode] << 4 : 0;
  this._port._simple_cmd([CMD.GPIO_INT, this.pin | bits]);
};

Tessel.Pin.prototype.high = function(cb) {
  this._port._simple_cmd([CMD.GPIO_HIGH, this.pin], cb);
  return this;
};

Tessel.Pin.prototype.low = function(cb) {
  this._port._simple_cmd([CMD.GPIO_LOW, this.pin], cb);
  return this;
};

// Deprecated. Added for tessel 1 lib compat
Tessel.Pin.prototype.rawWrite = function(value) {
  if (value) {
    this.high();
  } else {
    this.low();
  }
  return this;
};

Tessel.Pin.prototype.toggle = function(cb) {
  this._port._simple_cmd([CMD.GPIO_TOGGLE, this.pin], cb);
  return this;
};

Tessel.Pin.prototype.output = function output(initialValue, cb) {
  if (initialValue) {
    this.high(cb);
  } else {
    this.low(cb);
  }
  return this;
};

Tessel.Pin.prototype.write = function(value, cb) {
  // same as .output
  return this.output(value, cb);
};

Tessel.Pin.prototype.rawDirection = function() {
  throw new Error('Pin.rawDirection is deprecated. Use Pin.input or .output instead.');
};

Tessel.Pin.prototype._readPin = function(cmd, cb) {
  this._port.cork();
  this._port.sock.write(new Buffer([cmd, this.pin]));
  this._port.enqueue({
    size: 0,
    callback: function(err, data) {
      cb(err, data === REPLY.HIGH ? 1 : 0);
    },
  });
  this._port.uncork();
};

Tessel.Pin.prototype.rawRead = function rawRead(cb) {
  if (typeof cb !== 'function') {
    console.warn('pin.rawRead is async, pass in a callback to get the value');
  }
  this._readPin(CMD.GPIO_RAW_READ, cb);
  return this;
};

Tessel.Pin.prototype.input = function input(cb) {
  this._port._simple_cmd([CMD.GPIO_INPUT, this.pin], cb);
  return this;
};

Tessel.Pin.prototype.read = function(cb) {
  if (typeof cb !== 'function') {
    console.warn('pin.read is async, pass in a callback to get the value');
  }
  this._readPin(CMD.GPIO_IN, cb);
  return this;
};

Tessel.Pin.prototype.pull = function(pullType, cb) {

  // Ensure this pin supports being pulled
  if (!this.pullSupported) {
    throw new Error('Internal pull resistors are not available on this pin. Please use pins 2-7.');
  }

  // Set a default value to 'none';
  if (pullType === undefined) {
    pullType = 'none';
  }

  var mode = Tessel.Pin.pullModes[pullType];

  // Ensure a valid mode was requested
  if (mode === undefined) {
    throw new Error('Invalid pull type. Must be one of: "pullup", "pulldown", or "none"');
  }

  // Send the command to the coprocessor
  this._port._simple_cmd([CMD.GPIO_PULL, (this.pin | (mode << 4))], cb);
};

Tessel.Pin.prototype.readPulse = function( /* type, timeout, callback */ ) {
  throw new Error('Pin.readPulse is not yet implemented');
};

var ANALOG_RESOLUTION = 4096;
Tessel.Pin.prototype.resolution = ANALOG_RESOLUTION;

Tessel.Pin.prototype.analogRead = function(cb) {
  if (!this.analogSupported) {
    console.warn('pin.analogRead is not supoprted on this pin. Analog read is supported on port A pins 4 and 7 and on all pins on port B');
    return this;
  }

  if (typeof cb !== 'function') {
    console.warn('analogPin.read is async, pass in a callback to get the value');
  }

  this._port.sock.write(new Buffer([CMD.ANALOG_READ, this.pin]));
  this._port.enqueue({
    size: 2,
    callback: function(err, data) {
      cb(err, (data[0] + (data[1] << 8)) / ANALOG_RESOLUTION * 3.3);
    },
  });

  return this;
};

Tessel.Pin.prototype.analogWrite = function(val) {
  // throw an error if this isn't the adc pin (port b, pin 7)
  if (this._port.name !== 'B' || this.pin !== 7) {
    throw new RangeError('Analog write can only be used on Pin 7 (G3) of Port B.');
  }

  // v_dac = data/(0x3ff)*reference voltage
  var data = val / 3.3 * 0x3ff;
  if (data > 1023 || data < 0) {
    throw new RangeError('Analog write must be between 0 and 3.3');
  }

  this._port.sock.write(new Buffer([CMD.ANALOG_WRITE, data >> 8, data & 0xff]));
  return this;
};

// Duty cycle should be a value between 0 and 1
Tessel.Pin.prototype.pwmDutyCycle = function(dutyCycle, cb) {
  // throw an error if this pin doesn't support PWM
  if (!this.pwmSupported) {
    throw new RangeError('PWM can only be used on TX (pin 5) and RX (pin 6) of either module port.');
  }

  if (typeof dutyCycle !== 'number' || dutyCycle > 1.0 || dutyCycle < 0) {
    throw new RangeError('PWM duty cycle must be a number between 0 and 1');
  }

  // The frequency must be set prior to setting the duty cycle
  if (pwmBankSettings.period === 0) {
    throw new Error('PWM Frequency is not configured. You must call Tessel.pwmFrequency before setting duty cycle.');
  }

  // Calculate number of ticks for specified duty cycle
  var dutyCycleTicks = Math.floor(dutyCycle * pwmBankSettings.period);
  // Construct packet
  var packet = new Buffer([CMD.PWM_DUTY_CYCLE, this.pin, dutyCycleTicks >> 8, dutyCycleTicks & 0xff]);

  // Write it to the socket
  this._port.sock.write(packet, cb);

  return this;
};

Tessel.I2C = function(params) {
  var frequency = 1e5;

  if (params.address == null) {
    throw new Error('Tessel.I2C expected an address');
  }

  Object.defineProperties(this, {
    frequency: {
      get: () => {
        return frequency;
      },
      set: (value) => {
        // Restrict to between 100kHz and 400kHz.
        // Can actually go up to 4mhz without clk modification
        if (value !== 1e5 && value !== 4e5) {
          // http://asf.atmel.com/docs/3.15.0/samd21/html/group__asfdoc__sam0__sercom__i2c__group.html#gace1e0023f2eee92565496a2e30006548
          throw new RangeError('I2C frequency must be 100kHz or 400kHz');
        }

        frequency = value;
      }
    },
    baudrate: {
      get: () => {
        return Tessel.I2C.computeBaud(frequency);
      }
    }
  });

  this._port = params.port;

  // For t1-firmware compatibility, this.addr = ...
  this.addr = this.address = params.address;

  // This is setting the accessor defined above
  this.frequency = params.frequency ? params.frequency : 100000; // 100khz

  // Send the ENABLE_I2C command when the first I2C device is instantiated
  if (!this._port.I2C.enabled) {
    this._port._simple_cmd([CMD.ENABLE_I2C, this.baudrate]);
    // Note that this bus is enabled now
    this._port.I2C.enabled = true;
  }
};

Tessel.I2C.computeBaud = function(frequency) {
  // 15ns is max scl rise time
  // f = (48e6)/(2*(5+baud)+48e6*1.5e-8)
  var baud = Math.floor(((48e6 / frequency) - 48e6 * (1.5e-8)) / 2 - 5);

  return Math.max(0, Math.min(baud, 255));
};

Tessel.I2C.prototype.send = function(data, callback) {
  this._port.cork();
  this._port._simple_cmd([CMD.START, this.address << 1]);
  this._port._tx(data);
  this._port._simple_cmd([CMD.STOP], callback);
  this._port.uncork();
};

Tessel.I2C.prototype.read = function(length, callback) {
  this._port.cork();
  this._port._simple_cmd([CMD.START, this.address << 1 | 1]);
  this._port._rx(length, callback);
  this._port._simple_cmd([CMD.STOP]);
  this._port.uncork();
};

Tessel.I2C.prototype.transfer = function(txbuf, rxlen, callback) {
  this._port.cork();
  if (txbuf.length > 0) {
    this._port._simple_cmd([CMD.START, this.address << 1]);
    this._port._tx(txbuf);
  }
  this._port._simple_cmd([CMD.START, this.address << 1 | 1]);
  this._port._rx(rxlen, callback);
  this._port._simple_cmd([CMD.STOP]);
  this._port.uncork();
};

Tessel.SPI = function(params, port) {
  this._port = port;
  // Default the params if none were provided
  params = params || {};
  // default to pin 5 of the module port as cs
  this.chipSelect = params.chipSelect || this._port.digital[0];

  this.chipSelectActive = params.chipSelectActive === 'high' || params.chipSelectActive === 1 ? 1 : 0;

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
  this.clockSpeed = params.clockSpeed ? params.clockSpeed : 2e6;

  // if speed is slower than 93750 then we need a clock divisor
  if (this.clockSpeed < 368 || this.clockSpeed > 24e6) {
    throw new RangeError('SPI clock must be between 368Hz and 24MHz');
  }

  this._clockReg = Math.floor(48e6 / (2 * this.clockSpeed) - 1);

  // find the smallest clock divider such that clockReg is <=255
  if (this._clockReg > 255) {
    // find the clock divider, make sure its at least 1
    this._clockDiv = Math.floor(48e6 / (this.clockSpeed * (2 * 255 + 2))) || 1;

    // if the speed is still too low, set the clock divider to max and set baud accordingly
    if (this._clockDiv > 255) {
      this._clockReg = Math.floor(this._clockReg / 255) || 1;
      this._clockDiv = 255;
    } else {
      // if we can set a clock divider <255, max out clockReg
      this._clockReg = 255;
    }
  } else {
    this._clockDiv = 1;
  }

  if (typeof params.dataMode === 'number') {
    params.cpol = params.dataMode & 0x1;
    params.cpha = params.dataMode & 0x2;
  }

  this.cpol = params.cpol === 'high' || params.cpol === 1 ? 1 : 0;
  this.cpha = params.cpha === 'second' || params.cpha === 1 ? 1 : 0;

  this._port._simple_cmd([CMD.ENABLE_SPI, this.cpol + (this.cpha << 1), this._clockReg, this._clockDiv]);
};

Tessel.SPI.prototype.send = function(data, callback) {
  this._port.cork();
  this.chipSelect.low();
  this._port._tx(data, callback);
  this.chipSelect.high();
  this._port.uncork();
};

Tessel.SPI.prototype.disable = function() {
  // Tell the coprocessor to disable this interface
  this._port._simple_cmd([CMD.CMD_DISABLE_SPI]);
  // Unreference the previous SPI object
  this._port._spi = undefined;
};

Tessel.SPI.prototype.receive = function(data_len, callback) {
  this._port.cork();
  this.chipSelect.low();
  this._port._rx(data_len, callback);
  this.chipSelect.high();
  this._port.uncork();
};

Tessel.SPI.prototype.transfer = function(data, callback) {
  this._port.cork();
  this.chipSelect.low();
  this._port._txrx(data, callback);
  this.chipSelect.high();
  this._port.uncork();
};

Tessel.UART = function(port, options) {
  Duplex.call(this, {});

  var baudrate = 9600;

  Object.defineProperties(this, {
    baudrate: {
      get: () => {
        return baudrate;
      },
      set: (value) => {
        // baud is given by the following:
        // baud = 65536*(1-(samples_per_bit)*(f_wanted/f_ref))
        // samples_per_bit = 16, 8, or 3
        // f_ref = 48e6

        if (value < 9600 || value > 115200) {
          throw new Error('UART baudrate must be between 9600 and 115200');
        }

        baudrate = value;

        var computed = Math.floor(65536 * (1 - 16 * (baudrate / 48e6)));

        this._port._simple_cmd([CMD.ENABLE_UART, computed >> 8, computed & 0xFF]);
      }
    }
  });

  this._port = port;
  this.baudrate = options.baudrate || 9600;
};

util.inherits(Tessel.UART, Duplex);

Tessel.UART.prototype._write = function(chunk, encoding, cb) {
  // throw an error if not enabled
  if (!this._port._uart) {
    throw new Error('UART is not enabled on this port');
  }
  this._port._tx(chunk, cb);
};

Tessel.UART.prototype._read = function() {};

Tessel.UART.prototype.disable = function() {
  // Tell the coprocessor to disable this interface
  this._port._simple_cmd([CMD.DISABLE_UART, 0, 0]);
  // Unreference this socket if there are no more items waiting on it
  // Specifically because it is asynchronous
  this._port.unref();
  // Unreference the previous uart object
  this._port._uart = undefined;
};

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
  GPIO_INPUT: 22,
  GPIO_RAW_READ: 23,
  GPIO_PULL: 26,
  ANALOG_READ: 24,
  ANALOG_WRITE: 25,
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
  PWM_DUTY_CYCLE: 27,
  PWM_PERIOD: 28,
};

var REPLY = {
  ACK: 0x80,
  NACK: 0x81,
  HIGH: 0x82,
  LOW: 0x83,
  DATA: 0x84,

  MIN_ASYNC: 0xA0,
  ASYNC_PIN_CHANGE_N: 0xC0, // c0 to c8 is all async pin assignments
  ASYNC_UART_RX: 0xD0
};

// Currently unused. Uncomment when ready to implement
// var SPISettings = {
//   CPOL: 1,
//   CPHA: 2
// };
//
var prefix = '/sys/devices/leds/leds/tessel:';
var suffix = '/brightness';

Tessel.LEDs = function(defs) {
  var descriptors = {};
  var leds = [];

  defs.forEach(function(definition, index) {
    var name = definition.color + ':' + definition.type;
    var path = prefix + name + suffix;
    var color = definition.color;
    descriptors[index] = {
      get: function() {
        // On first access of any built-
        // in LED...
        if (leds[index] === undefined) {
          // The LED object must be initialized
          leds[index] = new Tessel.LED(color, path);
          // And set to 0
          leds[index].low();
        }
        return leds[index];
      }
    };
  }, this);

  descriptors.length = {
    value: defs.length
  };

  Object.defineProperties(this, descriptors);
};

['on', 'off', 'toggle'].forEach(function(operation) {
  Tessel.LEDs.prototype[operation] = function() {
    for (var i = 0; i < this.length; i++) {
      this[i][operation]();
    }

    return this;
  };
});

Tessel.LED = function(color, path) {
  var state = {
    color: color,
    path: path,
    value: 0,
  };

  // Define data properties that enforce
  // write privileges.
  Object.defineProperties(this, {
    color: {
      value: state.color
    },
    path: {
      value: state.path
    },
    value: {
      get: function() {
        return state.value;
      },
      set: function(value) {
        // Treat any truthiness as "high"
        state.value = value ? 1 : 0;
      }
    },
    isOn: {
      get: function() {
        return state.value === 1;
      }
    }
  });
};

Tessel.LED.prototype.high = function(callback) {
  this.write(true, callback);
};

Tessel.LED.prototype.low = function(callback) {
  this.write(false, callback);
};

Tessel.LED.prototype.on = function() {
  this.write(1);
  return this;
};

Tessel.LED.prototype.off = function() {
  this.write(0);
  return this;
};

Tessel.LED.prototype.toggle = function(callback) {
  this.write(this.value ? 0 : 1, callback);
};

Tessel.LED.prototype.write = function(value, callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  this.value = value;

  fs.writeFile(this.path, String(this.value), callback);
};

// Define backward compatibility alias
Tessel.LED.prototype.output = Tessel.LED.prototype.write;

Tessel.LED.prototype.read = function(callback) {
  var value = this.value;
  setImmediate(function() {
    callback(null, value);
  });
};

Tessel.Wifi = function() {
  var state = {
    settings: {},
    connected: false
  };

  Object.defineProperties(this, {
    isConnected: {
      get: () => state.connected
    },
    connected: {
      set: (value) => {
        state.connected = value;
      }
    },
    settings: {
      get: () => state.settings,
      set: (settings) => {
        state.settings = Object.assign(state.settings, settings);
      }
    }
  });
};

util.inherits(Tessel.Wifi, EventEmitter);

Tessel.Wifi.prototype.enable = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  turnOnWifi()
    .then(commitWireless)
    .then(restartWifi)
    .then(() => {
      this.emit('connect', this.settings);
      this.connected = true;
      callback();
    })
    .catch((error) => {
      this.connected = false;
      this.emit('error', error);
      callback(error);
    });
};

Tessel.Wifi.prototype.disable = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  turnOffWifi()
    .then(commitWireless)
    .then(restartWifi)
    .then(() => {
      this.connected = false;
      this.emit('disconnect');
      callback();
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.Wifi.prototype.reset = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  this.connected = false;
  this.emit('disconnect', 'Resetting connection');
  restartWifi()
    .then(() => {
      this.connected = true;
      this.emit('connect', this.settings);
      callback();
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.Wifi.prototype.connection = function() {
  if (this.isConnected) {
    return this.settings;
  } else {
    return null;
  }
};

Tessel.Wifi.prototype.connect = function(settings, callback) {
  if (typeof settings !== 'object' || settings.ssid.length === 0) {
    throw new Error('Wifi settings must be an object with at least a "ssid" property.');
  }

  if (typeof callback !== 'function') {
    callback = function() {};
  }

  if (settings.password && !settings.security) {
    settings.security = 'psk2';
  }

  if (!settings.password && (!settings.security || settings.security === 'none')) {
    settings.password = '';
    settings.security = 'none';
  }

  connectToNetwork(settings)
    .then(turnOnWifi)
    .then(commitWireless)
    .then(restartWifi)
    .then(getWifiInfo)
    .then((network) => {
      delete settings.password;

      this.settings = Object.assign(network, settings);
      this.connected = true;
      this.emit('connect', this.settings);

      callback(null, this.settings);
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.Wifi.prototype.findAvailableNetworks = function(callback) {
  if (typeof callback !== 'function') {
    throw new Error('Must include a callback function');
  }

  isEnabled()
    .then((enabled) => {
      if (enabled) {
        return scanWifi();
      } else {
        return turnOnWifi()
          .then(commitWireless)
          .then(restartWifi)
          .then(scanWifi);
      }
    })
    .then((networks) => {
      callback(null, networks);
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

function connectToNetwork(settings) {
  var commands = `
    uci batch <<EOF
    set wireless.@wifi-iface[0].ssid="${settings.ssid}"
    set wireless.@wifi-iface[0].key="${settings.password}"
    set wireless.@wifi-iface[0].encryption=${settings.security}
    EOF
  `;

  return new Promise((resolve) => {
    childProcess.exec(commands, (error) => {
      if (error) {
        throw error;
      }

      resolve();
    });
  });
}

function turnOnWifi() {
  return new Promise((resolve) => {
    childProcess.exec('uci set wireless.@wifi-iface[0].disabled=0', (error) => {
      if (error) {
        throw error;
      }
      resolve();
    });
  });
}

function turnOffWifi() {
  return new Promise((resolve) => {
    childProcess.exec('uci set wireless.@wifi-iface[0].disabled=1', (error) => {
      if (error) {
        throw error;
      }
      resolve();
    });
  });
}

function commitWireless() {
  return new Promise((resolve) => {
    childProcess.exec('uci commit wireless', (error) => {
      if (error) {
        throw error;
      }
      resolve();
    });
  });
}

function restartWifi() {
  return new Promise((resolve) => {
    childProcess.exec('wifi', (error) => {
      if (error) {
        throw error;
      }

      resolve();
    });
  });
}

function isEnabled() {
  return new Promise((resolve) => {
    childProcess.exec('uci get wireless.@wifi-iface[0].disabled', (error, result) => {
      if (error) {
        throw error;
      }

      resolve(!Number(result));
    });
  });
}

function getWifiInfo() {
  return new Promise((resolve, reject) => {
    var checkCount = 0;

    function recursiveWifi() {
      setImmediate(() => {
        childProcess.exec(`ubus call iwinfo info '{"device":"wlan0"}'`, (error, results) => {
          if (error) {
            recursiveWifi();
          } else {
            try {
              var network = JSON.parse(results);

              if (network.ssid === undefined) {
                // using 6 because it's the lowest count with accurate results after testing
                if (checkCount < 6) {
                  checkCount++;
                  recursiveWifi();
                } else {
                  var msg = 'Tessel is unable to connect, please check your credentials or list of available networks (using tessel.network.wifi.findAvailableNetworks()) and try again.';
                  throw msg;
                }
              } else {
                childProcess.exec('ifconfig wlan0', (error, ipResults) => {
                  if (error) {
                    reject(error);
                  } else {
                    network.ips = ipResults.split('\n');
                    resolve(network);
                  }
                });
              }
            } catch (error) {
              reject(error);
            }
          }
        });
      });
    }

    recursiveWifi();
  });
}

function scanWifi() {
  return new Promise((resolve) => {
    var checkCount = 0;

    function recursiveScan() {
      setImmediate(() => {
        childProcess.exec('iwinfo wlan0 scan', (error, results) => {
          if (error) {
            recursiveScan();
          }

          var ssidRegex = /ESSID: "(.*)"/;
          var qualityRegex = /Quality: (.*)/;
          var encryptionRegex = /Encryption: (.*)/;

          var networks = results.trim().split('\n\n').reduce((networks, entry) => {
            try {
              var networkInfo = {
                // Parse out the SSID
                ssid: ssidRegex.exec(entry)[1],
                // Parse out the quality of the connection
                quality: qualityRegex.exec(entry)[1],
                // Parse the security type - unused at the moment
                security: encryptionRegex.exec(entry)[1],
              };
              // Add this parsed network to our array
              networks.push(networkInfo);
            } catch (error) {
              // suppress errors created by entries that cannot be parsed
            }

            return networks;
          }, []).sort(compareBySignal);

          // after 13 attempts to scan, resolve with an empty array
          if (networks.length === 0 && checkCount < 13) {
            checkCount++;
            recursiveScan();
          } else {
            resolve(networks);
          }
        });
      });
    }

    recursiveScan();
  });
}

function safeQualityExprEvaluation(expr) {
  var parsed = /(\d.*)(?:\/)(\d.*)/.exec(expr);
  var isNumber = parsed === null && typeof + expr === 'number' && !Number.isNaN(+expr);

  // If the expression doesn't match "\d.*/\d.*",
  // but IS a number, then return the number. Otherwise,
  // evaluate the expression as division. ToNumber is
  // applied implicitly. If the expression didn't parse
  // safely, return 0.
  return isNumber ? +expr : (parsed && parsed.length === 3 ? parsed[1] / parsed[2] : 0);
}

function compareBySignal(a, b) {
  var ae = safeQualityExprEvaluation(a.quality);
  var be = safeQualityExprEvaluation(b.quality);

  if (ae > be) {
    return -1;
  } else if (ae < be) {
    return 1;
  } else {
    return 0;
  }
}

// Access Point
Tessel.AP = function() {
  var state = {
    settings: {}
  };

  Object.defineProperties(this, {
    settings: {
      get: () => state.settings,
      set: (settings) => {
        state.settings = Object.assign(state.settings, settings);
      }
    }
  });
};

util.inherits(Tessel.AP, EventEmitter);

Tessel.AP.prototype.enable = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  turnOnAP()
    .then(commitWireless)
    .then(restartWifi)
    .then(() => {
      this.emit('on', this.settings);
      this.emit('enable', this.settings);
      callback();
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.AP.prototype.disable = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  turnOffAP()
    .then(commitWireless)
    .then(restartWifi)
    .then(() => {
      this.emit('off');
      this.emit('disable');
      callback();
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.AP.prototype.reset = function(callback) {
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  this.emit('reset', 'Resetting connection');
  this.emit('off');
  this.emit('disable');
  restartWifi()
    .then(() => {
      this.emit('on', this.settings);
      this.emit('enable', this.settings);
      callback();
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

Tessel.AP.prototype.create = function(settings, callback) {
  if (typeof settings !== 'object' || settings.ssid.length === 0) {
    throw new Error('Access point settings must be an object with at least a "ssid" property.');
  }

  if (typeof callback !== 'function') {
    callback = function() {};
  }

  if (settings.password && !settings.security) {
    settings.security = 'psk2';
  }

  if (!settings.password && (!settings.security || settings.security === 'none')) {
    settings.password = '';
    settings.security = 'none';
  }

  createNetwork(settings)
    .then(turnOnAP)
    .then(commitWireless)
    .then(restartWifi)
    .then(getAccessPointIP)
    .then((ip) => {
      this.settings = Object.assign(settings, {
        ip
      });
      this.emit('create', this.settings);

      callback(null, this.settings);
    })
    .catch((error) => {
      this.emit('error', error);
      callback(error);
    });
};

function createNetwork(settings) {
  var commands = `
    uci batch <<EOF
    set wireless.@wifi-iface[1].ssid="${settings.ssid}"
    set wireless.@wifi-iface[1].key="${settings.password}"
    set wireless.@wifi-iface[1].encryption="${settings.security}"
    EOF
  `;

  return new Promise((resolve) => {
    childProcess.exec(commands, (error) => {
      if (error) {
        throw error;
      }

      resolve();
    });
  });
}

function getAccessPointIP() {
  return new Promise((resolve) => {
    childProcess.exec('uci get network.lan.ipaddr', (error, ip) => {
      if (error) {
        throw error;
      }

      ip = ip.replace('\n', '').trim();
      resolve(ip);
    });
  });
}

function turnOnAP() {
  return new Promise((resolve) => {
    childProcess.exec('uci set wireless.@wifi-iface[1].disabled=0', (error) => {
      if (error) {
        throw error;
      }
      resolve();
    });
  });
}

function turnOffAP() {
  return new Promise((resolve) => {
    childProcess.exec('uci set wireless.@wifi-iface[1].disabled=1', (error) => {
      if (error) {
        throw error;
      }
      resolve();
    });
  });
}

if (process.env.IS_TEST_MODE) {
  Tessel.CMD = CMD;
  Tessel.REPLY = REPLY;
  Tessel.pwmBankSettings = pwmBankSettings;
  Tessel.pwmMinFrequency = PWM_MIN_FREQUENCY;
  Tessel.pwmMaxFrequency = PWM_MAX_FREQUENCY;
  Tessel.pwmPrescalars = PWM_PRESCALARS;
  Tessel.determineDutyCycleAndPrescalar = determineDutyCycleAndPrescalar;
}


process.on('exit', function() {
  if (Tessel.instance) {
    Tessel.instance.close();
  }
});

module.exports = Tessel;
