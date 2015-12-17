process.env.IS_TEST_MODE = true;

var sinon = require('sinon');
var Tessel = require('../../tessel-export');
var version = 2;

// These are ONLY exported for testing.
var CMD = Tessel.CMD;
var REPLY = Tessel.REPLY;

// Shared sinon sandbox
var sandbox = sinon.sandbox.create();

// Used within tessel.js, can be stubs/spies
// Uncomment as necessary.
//
var util = require('util');
var EventEmitter = require('events').EventEmitter;
// var Duplex = require('stream').Duplex;
var net = require('net');
var fs = require('fs');

function FakeSocket() {
  this.ref = function() {};
  this.unref = function() {};
}
util.inherits(FakeSocket, EventEmitter);

exports['Tessel'] = {
  setUp: function(done) {
    this.LED = sandbox.spy(Tessel, 'LED');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');

    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  instanceReused: function(test) {
    test.expect(1);
    test.equal(new Tessel(), this.tessel);
    test.done();
  },

  instanceProperties: function(test) {
    test.expect(5);
    test.notEqual(typeof this.tessel.ports, undefined);
    test.notEqual(typeof this.tessel.port, undefined);
    test.notEqual(typeof this.tessel.led, undefined);
    test.notEqual(typeof this.tessel.network, undefined);
    test.notEqual(typeof this.tessel.version, undefined);
    test.done();
  },

  portsAliasToPort: function(test) {
    test.expect(1);
    test.equal(this.tessel.port, this.tessel.ports);
    test.done();
  },

  twoPortsInitialized: function(test) {
    test.expect(5);
    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.deepEqual(this.Port.firstCall.args, ['A', '/var/run/tessel/port_a', this.tessel]);
    test.deepEqual(this.Port.lastCall.args, ['B', '/var/run/tessel/port_b', this.tessel]);
    test.done();
  },

  ledsLazyInitialization: function(test) {
    test.expect(3);
    test.equal(this.LED.callCount, 0);
    // Trigger a [[Get]]
    test.equal(this.tessel.led[0] instanceof Tessel.LED, true);
    test.equal(this.LED.callCount, 1);
    test.done();
  },

  ledsLazyInitializedAndOff: function(test) {
    test.expect(5);
    test.equal(this.tessel.led[0].value, 0);
    test.equal(this.fsWrite.callCount, 1);
    test.equal(this.fsWrite.lastCall.args[0], '/sys/devices/leds/leds/tessel:red:error/brightness');
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.equal(this.LED.callCount, 1);
    test.done();
  },

  fourLEDsInitialized: function(test) {
    test.expect(9);
    test.equal(this.tessel.led[0] instanceof Tessel.LED, true);
    test.equal(this.tessel.led[1] instanceof Tessel.LED, true);
    test.equal(this.tessel.led[2] instanceof Tessel.LED, true);
    test.equal(this.tessel.led[3] instanceof Tessel.LED, true);
    test.equal(this.LED.callCount, 4);
    test.deepEqual(
      this.LED.getCall(0).args, ['red', '/sys/devices/leds/leds/tessel:red:error/brightness']
    );
    test.deepEqual(
      this.LED.getCall(1).args, ['amber', '/sys/devices/leds/leds/tessel:amber:wlan/brightness']
    );
    test.deepEqual(
      this.LED.getCall(2).args, ['green', '/sys/devices/leds/leds/tessel:green:user1/brightness']
    );
    test.deepEqual(
      this.LED.getCall(3).args, ['blue', '/sys/devices/leds/leds/tessel:blue:user2/brightness']
    );

    test.done();
  },

  tesselVersion: function(test) {
    test.expect(1);
    test.equal(this.tessel.version, version);
    test.done();
  },
};


exports['Tessel.LED'] = {
  setUp: function(done) {
    this.LED = sandbox.spy(Tessel, 'LED');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  high: function(test) {
    test.expect(2);

    this.tessel.led[0].high();

    test.equal(this.tessel.led[0].value, '1');
    test.equal(this.fsWrite.lastCall.args[1], '1');
    test.done();
  },

  on: function(test) {
    test.expect(3);
    test.equal(this.tessel.led[0].on(), this.tessel.led[0]);
    test.equal(this.tessel.led[0].value, '1');
    test.equal(this.fsWrite.lastCall.args[1], '1');
    test.done();
  },

  low: function(test) {
    test.expect(2);

    this.tessel.led[0].low();

    test.equal(this.tessel.led[0].value, '0');
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.done();
  },

  off: function(test) {
    test.expect(3);
    test.equal(this.tessel.led[0].off(), this.tessel.led[0]);
    test.equal(this.tessel.led[0].value, '0');
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.done();
  },

  isOn: function(test) {
    test.expect(3);

    test.equal(this.tessel.led[0].isOn, false);

    this.tessel.led[0].on();

    test.equal(this.tessel.led[0].isOn, true);

    test.throws(function() {
      this.tessel.led[0].isOn = false;
    });
    test.done();
  },

  outputIsTheSameAsWrite: function(test) {
    test.expect(1);
    test.equal(Tessel.LED.prototype.output, Tessel.LED.prototype.write);
    test.done();
  },

  writeUpdatesTheValue: function(test) {
    test.expect(2);

    test.equal(this.tessel.led[0].value, '0');
    this.tessel.led[0].write(1);
    test.equal(this.tessel.led[0].value, '1');

    test.done();
  },
};

exports['Tessel.LEDs (collection operations)'] = {
  setUp: function(done) {
    this.LED = sandbox.spy(Tessel, 'LED');
    this.LEDs = sandbox.spy(Tessel, 'LEDs');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');

    this.on = sandbox.spy(Tessel.LED.prototype, 'on');
    this.off = sandbox.spy(Tessel.LED.prototype, 'off');
    this.toggle = sandbox.spy(Tessel.LED.prototype, 'toggle');

    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  alias: function(test) {
    test.expect(1);
    test.equal(this.tessel.led, this.tessel.leds);
    test.done();
  },

  on: function(test) {
    test.expect(2);
    test.equal(this.tessel.leds.on(), this.tessel.leds);
    test.equal(this.on.callCount, 4);
    test.done();
  },

  off: function(test) {
    test.expect(2);
    test.equal(this.tessel.leds.off(), this.tessel.leds);
    test.equal(this.off.callCount, 4);
    test.done();
  },

  toggle: function(test) {
    test.expect(2);
    test.equal(this.tessel.leds.toggle(), this.tessel.leds);
    test.equal(this.toggle.callCount, 4);
    test.done();
  },

};


exports['Tessel.Port'] = {
  setUp: function(done) {
    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      return new FakeSocket();
    });

    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  emitter: function(test) {
    test.expect(1);

    var port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.ok(port instanceof EventEmitter);

    test.done();
  },

  instanceProperties: function(test) {
    test.expect(14);

    var port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.board, this.tessel);
    test.equal(port.mode, 'none');
    test.equal(port.name, 'foo');
    test.ok(Array.isArray(port.replyQueue));
    test.equal(port.replyQueue.length, 0);
    test.ok(Array.isArray(port.pin));
    test.equal(port.pin.length, 8);
    test.ok(Array.isArray(port.pwm));
    test.equal(port.pwm.length, 0);
    test.ok(port.sock);
    test.ok(port.I2C);
    test.equal(port.I2C.enabled, false);
    test.ok(port.SPI);
    test.ok(port.UART);

    test.done();
  },

  instancePropertiesDeprecated: function(test) {
    test.expect(7);

    var port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.pin.G1, port.pin.g1);
    test.equal(port.pin.G1, port.pin[5]);
    test.equal(port.pin.G2, port.pin.g2);
    test.equal(port.pin.G2, port.pin[6]);
    test.equal(port.pin.G3, port.pin.g3);
    test.equal(port.pin.G3, port.pin[7]);
    test.deepEqual(port.digital, [port.pin[5], port.pin[6], port.pin[7]]);
    test.done();
  },

  forwardSocketPath: function(test) {
    test.expect(1);

    new Tessel.Port('foo', '/foo/bar/baz', this.tessel);
    test.deepEqual(this.createConnection.lastCall.args[0], {
      path: '/foo/bar/baz'
    });
    test.done();
  },

  eightPinsInitialized: function(test) {
    test.expect(9);

    this.Pin = sandbox.stub(Tessel, 'Pin');

    var port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(this.Pin.callCount, 8);
    test.equal(port.pin[0] instanceof Tessel.Pin, true);
    test.equal(port.pin[1] instanceof Tessel.Pin, true);
    test.equal(port.pin[2] instanceof Tessel.Pin, true);
    test.equal(port.pin[3] instanceof Tessel.Pin, true);
    test.equal(port.pin[5] instanceof Tessel.Pin, true);
    test.equal(port.pin[6] instanceof Tessel.Pin, true);
    test.equal(port.pin[4] instanceof Tessel.Pin, true);
    test.equal(port.pin[7] instanceof Tessel.Pin, true);

    test.done();
  },

  analogSupportedA: function(test) {
    test.expect(8);

    var port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].analogSupported, false);
    test.equal(port.pin[1].analogSupported, false);
    test.equal(port.pin[2].analogSupported, false);
    test.equal(port.pin[3].analogSupported, false);
    test.equal(port.pin[5].analogSupported, false);
    test.equal(port.pin[6].analogSupported, false);

    test.equal(port.pin[4].analogSupported, true);
    test.equal(port.pin[7].analogSupported, true);

    test.done();
  },

  analogSupportedB: function(test) {
    test.expect(8);

    var port = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].analogSupported, true);
    test.equal(port.pin[1].analogSupported, true);
    test.equal(port.pin[2].analogSupported, true);
    test.equal(port.pin[3].analogSupported, true);
    test.equal(port.pin[4].analogSupported, true);
    test.equal(port.pin[5].analogSupported, true);
    test.equal(port.pin[6].analogSupported, true);
    test.equal(port.pin[7].analogSupported, true);

    test.done();
  },

  interruptSupportedA: function(test) {
    test.expect(8);

    var port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].interruptSupported, false);
    test.equal(port.pin[1].interruptSupported, false);
    test.equal(port.pin[3].interruptSupported, false);
    test.equal(port.pin[4].interruptSupported, false);

    test.equal(port.pin[2].interruptSupported, true);
    test.equal(port.pin[5].interruptSupported, true);
    test.equal(port.pin[6].interruptSupported, true);
    test.equal(port.pin[7].interruptSupported, true);

    test.done();
  },

  interruptSupportedB: function(test) {
    test.expect(8);

    var port = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].interruptSupported, false);
    test.equal(port.pin[1].interruptSupported, false);
    test.equal(port.pin[3].interruptSupported, false);
    test.equal(port.pin[4].interruptSupported, false);

    test.equal(port.pin[2].interruptSupported, true);
    test.equal(port.pin[5].interruptSupported, true);
    test.equal(port.pin[6].interruptSupported, true);
    test.equal(port.pin[7].interruptSupported, true);

    test.done();
  },
};

exports['Tessel.Port.prototype'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      this.socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return this.socket;
    }.bind(this));

    this.tessel = new Tessel();

    this.I2C = sandbox.stub(Tessel, 'I2C');
    this.SPI = sandbox.stub(Tessel, 'SPI');
    this.UART = sandbox.stub(Tessel, 'UART');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);
    this.a = new Tessel.Port('A', '/foo/bar/a', this.tessel);
    this.b = new Tessel.Port('B', '/foo/bar/b', this.tessel);
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  cork: function(test) {
    test.expect(1);

    this.port.cork();
    test.equal(this.socket.cork.callCount, 1);
    test.done();
  },

  uncork: function(test) {
    test.expect(1);

    this.port.uncork();
    test.equal(this.socket.uncork.callCount, 1);
    test.done();
  },

  sync: function(test) {
    test.expect(6);

    this.port.sync();
    test.equal(this.socket.write.callCount, 0);
    test.equal(this.port.replyQueue.length, 0);

    this.port.sync(function() {});
    test.equal(this.socket.write.callCount, 1);
    test.equal(this.port.replyQueue.length, 1);

    var buffer = this.socket.write.lastCall.args[0];

    test.equal(buffer instanceof Buffer, true);
    test.equal(buffer.readUInt8(0), CMD.ECHO);

    // TODO: test the other two buffer values,
    // but need to know what their purpose is.

    test.done();
  },

  _simple_cmd: function(test) {
    test.expect(4);

    this.port._simple_cmd([], function() {});

    test.equal(this.socket.cork.callCount, 1);
    test.equal(this.socket.uncork.callCount, 1);

    // Called by _simple_cmd and sync
    test.equal(this.socket.write.callCount, 2);

    // The first call is from _simple_cmd.
    var buffer = this.socket.write.firstCall.args[0];

    test.equal(buffer instanceof Buffer, true);

    test.done();
  },

  _status_cmd: function(test) {
    test.expect(3);

    this.port._status_cmd([], function() {});
    test.equal(this.socket.write.callCount, 1);
    test.equal(this.port.replyQueue.length, 1);

    var buffer = this.socket.write.lastCall.args[0];

    test.equal(buffer instanceof Buffer, true);

    test.done();
  },

  _spi: function(test) {
    test.expect(5);

    test.equal(this.port._spi, undefined);

    var format = {};
    this.port.SPI(format);

    test.notEqual(this.port._spi, undefined);
    test.equal(Tessel.SPI.callCount, 1);
    test.deepEqual(Tessel.SPI.lastCall.args[0], format);
    test.equal(this.port._spi instanceof Tessel.SPI, true);

    test.done();
  },

  _uart: function(test) {
    test.expect(5);

    test.equal(this.port._uart, undefined);

    var format = {};
    this.port.UART(format);

    test.notEqual(this.port._uart, undefined);
    test.equal(Tessel.UART.callCount, 1);
    test.deepEqual(Tessel.UART.lastCall.args, [this.port, format]);
    test.equal(this.port._uart instanceof Tessel.UART, true);

    test.done();
  },

  I2C: function(test) {
    test.expect(6);

    var device1 = new this.port.I2C(0x00);
    var device2 = new this.port.I2C(0x01);

    test.notEqual(device1, device2);
    test.equal(device1 instanceof Tessel.I2C, true);
    test.equal(device2 instanceof Tessel.I2C, true);
    test.equal(Tessel.I2C.callCount, 2);

    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);
    test.equal(Tessel.I2C.lastCall.args[0].port, this.port);

    test.done();
  },

  multiplePortsI2C: function(test) {
    test.expect(11);

    var aDevice1 = new this.a.I2C(0x00);
    var aDevice2 = new this.a.I2C(0x01);

    var bDevice1 = new this.b.I2C(0x00);
    var bDevice2 = new this.b.I2C(0x01);

    test.notEqual(aDevice1, aDevice2);
    test.notEqual(bDevice1, bDevice2);

    test.equal(aDevice1 instanceof Tessel.I2C, true);
    test.equal(aDevice2 instanceof Tessel.I2C, true);
    test.equal(bDevice1 instanceof Tessel.I2C, true);
    test.equal(bDevice2 instanceof Tessel.I2C, true);

    test.equal(Tessel.I2C.callCount, 4);

    test.equal(Tessel.I2C.firstCall.args[0].port, this.a);
    test.equal(Tessel.I2C.secondCall.args[0].port, this.a);

    test.equal(Tessel.I2C.thirdCall.args[0].port, this.b);
    test.equal(Tessel.I2C.lastCall.args[0].port, this.b);

    test.done();
  },

  _txLessThanByteTransferLimit: function(test) {
    test.expect(6);

    var buffer = new Buffer(255);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.sync = sandbox.stub(Tessel.Port.prototype, 'sync');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    this.a._tx(buffer, function() {});

    test.equal(this.cork.callCount, 1);
    test.equal(this.sync.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    // The 2 call write sequence is called once
    test.equal(this.a.sock.write.callCount, 2);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer));

    test.done();
  },

  _txGreaterThanByteTransferLimit: function(test) {
    test.expect(8);

    var buffer = new Buffer(510);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.sync = sandbox.stub(Tessel.Port.prototype, 'sync');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    this.a._tx(buffer, function() {});

    test.equal(this.cork.callCount, 1);
    test.equal(this.sync.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    // The 2 call write sequence is called twice, since there
    // is twice as many bytes as the transfer limit
    test.equal(this.a.sock.write.callCount, 4);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.secondCall.args[0].equals(buffer.slice(0, 255)));

    test.ok(this.a.sock.write.thirdCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer.slice(255)));

    test.done();
  },

  _txInvalidBuffer: function(test) {
    test.expect(1);

    test.throws(function() {
      this.a._tx(new Buffer(0));
    }.bind(this), RangeError);

    test.done();
  },

  _rx: function(test) {
    test.expect(5);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    var size = 4;
    var callback = sandbox.spy();

    this.a._rx(size, callback);

    test.equal(this.a.sock.write.callCount, 1);
    test.ok(this.a.sock.write.lastCall.args[0].equals(new Buffer([CMD.RX, size])));

    test.equal(this.a.replyQueue.length, 1);

    var replyQueueEntry = this.a.replyQueue[0];

    test.equal(replyQueueEntry.size, size);
    test.equal(replyQueueEntry.callback, callback);

    //
    // REPLY.DATA responses are tested in:
    // "Tessel.Port Commands (handling incoming socket stream)" -> "replydata"
    //

    test.done();
  },

  _rxInvalidLengthZero: function(test) {
    test.expect(1);

    test.throws(function() {
      this.a._rx(0);
    }.bind(this), RangeError);

    test.done();
  },

  _rxInvalidLengthMax: function(test) {
    test.expect(1);

    test.throws(function() {
      this.a._rx(256);
    }.bind(this), RangeError);

    test.done();
  },

  _txrx: function(test) {
    test.expect(8);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    var buffer = new Buffer(4);
    var callback = sandbox.spy();

    this.a._txrx(buffer, callback);

    test.equal(this.cork.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    test.equal(this.a.sock.write.callCount, 2);

    test.equal(this.a.replyQueue.length, 1);

    var replyQueueEntry = this.a.replyQueue[0];

    test.equal(replyQueueEntry.size, buffer.length);
    test.equal(replyQueueEntry.callback, callback);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TXRX, buffer.length])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer));

    test.done();
  },

  _txrxInvalidLengthZero: function(test) {
    test.expect(1);

    var buffer = new Buffer(0);

    test.throws(function() {
      this.a._txrx(buffer);
    }.bind(this), RangeError);

    test.done();
  },

  _txrxInvalidLengthMax: function(test) {
    test.expect(1);

    var buffer = new Buffer(256);

    test.throws(function() {
      this.a._txrx(buffer);
    }.bind(this), RangeError);

    test.done();
  },

};

exports['Tessel.Port Commands (handling incoming socket stream)'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      // Stubbed as needed
      this.socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return this.socket;
    }.bind(this));

    this.port = new Tessel.Port('foo', '/foo/bar/baz', {});

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  readableButNull: function(test) {
    test.expect(1);

    this.port.sock.read.returns(null);

    this.port.sock.emit('readable');

    setImmediate(function() {
      test.ok(true, 'Reaching the next execution turns means that Buffer.concat did not fail on `null`');
      test.done();
    }.bind(this));
  },

  replyhigh: function(test) {
    test.expect(1);

    this.port.sock.read.returns(new Buffer([REPLY.HIGH]));
    this.port.replyQueue.push({
      size: 0,
      callback: function(err, data) {
        test.equal(data, REPLY.HIGH);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replylow: function(test) {
    test.expect(1);

    this.port.sock.read.returns(new Buffer([REPLY.LOW]));
    this.port.replyQueue.push({
      size: 0,
      callback: function(err, data) {
        test.equal(data, REPLY.LOW);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replydata: function(test) {
    test.expect(4);

    this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f, 0x3f, 0x1f]));
    this.port.replyQueue.push({
      size: 4,
      callback: function(err, data) {
        test.equal(data[0], 0xff);
        test.equal(data[1], 0x7f);
        test.equal(data[2], 0x3f);
        test.equal(data[3], 0x1f);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replydatapartial: function(test) {
    test.expect(4);

    this.port.replyQueue.push({
      size: 4,
      callback: function(err, data) {
        test.equal(data[0], 0xff);
        test.equal(data[1], 0x7f);
        test.equal(data[2], 0x3f);
        test.equal(data[3], 0x1f);
        test.done();
      },
    });

    this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f]));
    this.port.sock.emit('readable');

    this.port.sock.read.returns(new Buffer([0x3f, 0x1f]));
    this.port.sock.emit('readable');
  },

  noregisteredreplyhandler: function(test) {
    test.expect(1);

    test.throws(function() {
      this.port.replyQueue.length = 0;
      this.port.sock.read.returns(new Buffer([REPLY.HIGH]));
      this.port.sock.emit('readable');
    }.bind(this), Error);

    test.done();
  },

  replydataunexpected: function(test) {
    test.expect(2);

    var spy = sandbox.spy();

    test.throws(function() {
      this.port.replyQueue.push({
        size: 0,
        callback: spy,
      });

      this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f]));
      this.port.sock.emit('readable');
    }.bind(this), Error);

    test.equal(spy.callCount, 0);
    test.done();
  },


  replyasyncpinchange: function(test) {
    test.expect(4);

    var low = sandbox.spy();
    var high = sandbox.spy();

    this.port.pin[2].once('low', low);
    this.port.pin[5].once('high', high);

    this.port.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + 2]));
    this.port.sock.emit('readable');

    this.port.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + 5]));
    this.port.sock.emit('readable');

    test.equal(low.callCount, 1);
    test.equal(high.callCount, 1);

    test.equal(this.port.pin[2].interruptMode, null);
    test.equal(this.port.pin[5].interruptMode, null);

    test.done();
  },

  replyminasync: function(test) {
    test.expect(1);

    this.port.on('async-event', function(data) {
      test.equal(data, REPLY.MIN_ASYNC);
      test.done();
    });

    this.port.sock.read.returns(new Buffer([REPLY.MIN_ASYNC]));
    this.port.sock.emit('readable');
  },
};

exports['Tessel.Pin'] = {
  setUp: function(done) {

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      var socket = new FakeSocket();
      socket.cork = sandbox.spy();
      socket.uncork = sandbox.spy();
      socket.write = sandbox.spy();
      // Stubbed as needed
      socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return socket;
    });

    this._simple_cmd = sandbox.stub(Tessel.Port.prototype, '_simple_cmd');

    this.tessel = new Tessel();

    this.a = new Tessel.Port('A', '/foo/bar/baz', this.tessel);
    this.b = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  emitter: function(test) {
    test.expect(1);
    test.equal(new Tessel.Pin(0, this.a) instanceof EventEmitter, true);
    test.done();
  },

  initializationA: function(test) {
    test.expect(38);

    var pins = [];

    for (var i = 0; i < 8; i++) {
      var intSupported = [2, 5, 6, 7].indexOf(i) !== -1;
      var adcSupported = i === 4 || i === 7;
      pins.push(
        new Tessel.Pin(i, this.a, intSupported, adcSupported)
      );
    }

    // Pin Number (matches index)
    test.equal(pins[0].pin, 0);
    test.equal(pins[1].pin, 1);
    test.equal(pins[2].pin, 2);
    test.equal(pins[3].pin, 3);
    test.equal(pins[4].pin, 4);
    test.equal(pins[5].pin, 5);
    test.equal(pins[6].pin, 6);
    test.equal(pins[7].pin, 7);

    // Port
    test.equal(pins[0]._port, this.a);
    test.equal(pins[1]._port, this.a);
    test.equal(pins[2]._port, this.a);
    test.equal(pins[3]._port, this.a);
    test.equal(pins[4]._port, this.a);
    test.equal(pins[5]._port, this.a);
    test.equal(pins[6]._port, this.a);
    test.equal(pins[7]._port, this.a);

    // Interrupts on 2, 5, 6, 7
    test.equal(pins[2].interruptSupported, true);
    test.equal(pins[5].interruptSupported, true);
    test.equal(pins[6].interruptSupported, true);
    test.equal(pins[7].interruptSupported, true);

    // Analog on 4, 7
    test.equal(pins[4].analogSupported, true);
    test.equal(pins[7].analogSupported, true);

    // Present Interrupt Mode
    test.equal(pins[0].interruptMode, null);
    test.equal(pins[1].interruptMode, null);
    test.equal(pins[2].interruptMode, null);
    test.equal(pins[3].interruptMode, null);
    test.equal(pins[4].interruptMode, null);
    test.equal(pins[5].interruptMode, null);
    test.equal(pins[6].interruptMode, null);
    test.equal(pins[7].interruptMode, null);

    // isPWM?
    test.equal(pins[0].isPWM, false);
    test.equal(pins[1].isPWM, false);
    test.equal(pins[2].isPWM, false);
    test.equal(pins[3].isPWM, false);
    test.equal(pins[4].isPWM, false);
    test.equal(pins[5].isPWM, false);
    test.equal(pins[6].isPWM, false);
    test.equal(pins[7].isPWM, false);

    test.done();
  },

  initializationB: function(test) {
    test.expect(44);

    var pins = [];

    for (var i = 0; i < 8; i++) {
      var intSupported = [2, 5, 6, 7].indexOf(i) !== -1;
      pins.push(
        new Tessel.Pin(i, this.b, intSupported, true)
      );
    }

    // Pin Number (matches index)
    test.equal(pins[0].pin, 0);
    test.equal(pins[1].pin, 1);
    test.equal(pins[2].pin, 2);
    test.equal(pins[3].pin, 3);
    test.equal(pins[4].pin, 4);
    test.equal(pins[5].pin, 5);
    test.equal(pins[6].pin, 6);
    test.equal(pins[7].pin, 7);

    // Port
    test.equal(pins[0]._port, this.b);
    test.equal(pins[1]._port, this.b);
    test.equal(pins[2]._port, this.b);
    test.equal(pins[3]._port, this.b);
    test.equal(pins[4]._port, this.b);
    test.equal(pins[5]._port, this.b);
    test.equal(pins[6]._port, this.b);
    test.equal(pins[7]._port, this.b);

    // Interrupts on 2, 5, 6, 7
    test.equal(pins[2].interruptSupported, true);
    test.equal(pins[5].interruptSupported, true);
    test.equal(pins[6].interruptSupported, true);
    test.equal(pins[7].interruptSupported, true);

    // Analog on all
    test.equal(pins[0].analogSupported, true);
    test.equal(pins[1].analogSupported, true);
    test.equal(pins[2].analogSupported, true);
    test.equal(pins[3].analogSupported, true);
    test.equal(pins[4].analogSupported, true);
    test.equal(pins[5].analogSupported, true);
    test.equal(pins[6].analogSupported, true);
    test.equal(pins[7].analogSupported, true);

    // Present Interrupt Mode
    test.equal(pins[0].interruptMode, null);
    test.equal(pins[1].interruptMode, null);
    test.equal(pins[2].interruptMode, null);
    test.equal(pins[3].interruptMode, null);
    test.equal(pins[4].interruptMode, null);
    test.equal(pins[5].interruptMode, null);
    test.equal(pins[6].interruptMode, null);
    test.equal(pins[7].interruptMode, null);

    // isPWM?
    test.equal(pins[0].isPWM, false);
    test.equal(pins[1].isPWM, false);
    test.equal(pins[2].isPWM, false);
    test.equal(pins[3].isPWM, false);
    test.equal(pins[4].isPWM, false);
    test.equal(pins[5].isPWM, false);
    test.equal(pins[6].isPWM, false);
    test.equal(pins[7].isPWM, false);

    test.done();
  },

  interruptHigh: function(test) {
    test.expect(9);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].once('high', spy);
      this.b.pin[pinIndex].once('high', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'high');
      test.equal(this.b.pin[pinIndex].interruptMode, 'high');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptLow: function(test) {
    test.expect(9);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].once('low', spy);
      this.b.pin[pinIndex].once('low', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'low');
      test.equal(this.b.pin[pinIndex].interruptMode, 'low');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptRise: function(test) {
    test.expect(9);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('rise', spy);
      this.b.pin[pinIndex].on('rise', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'rise');
      test.equal(this.b.pin[pinIndex].interruptMode, 'rise');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptFall: function(test) {
    test.expect(9);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('fall', spy);
      this.b.pin[pinIndex].on('fall', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'fall');
      test.equal(this.b.pin[pinIndex].interruptMode, 'fall');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptChange: function(test) {
    test.expect(9);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.b.pin[pinIndex].on('change', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  removeListener: function(test) {
    test.expect(14);

    var spy = sandbox.spy();
    var spy2 = sandbox.spy();
    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.a.pin[pinIndex].on('change', spy2);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');

      this.a.pin[pinIndex].removeListener('change', spy2);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');

      this.a.pin[pinIndex].removeListener('change', spy);
      test.equal(this.a.pin[pinIndex].interruptMode, null);

      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 0);
    test.equal(spy2.callCount, 0);
    test.done();
  },

  interruptNotSupported: function(test) {
    test.expect(8);

    [0, 1, 3, 4].forEach(function(pinIndex) {
      test.throws(function() {
        this.a.pin[pinIndex].once('low');
      }.bind(this), Error);
      test.throws(function() {
        this.b.pin[pinIndex].once('low');
      }.bind(this), Error);
    }, this);
    test.done();
  },

  _setInterruptModes: function(test) {
    test.expect(10);

    ['high', 'low', 'rise', 'fall', 'change'].forEach(function(mode) {
      this.a.pin[2]._setInterruptMode(mode);

      test.equal(this._simple_cmd.callCount, 1);
      test.deepEqual(
        this._simple_cmd.lastCall.args[0], [CMD.GPIO_INT, 2 | (Tessel.Pin.interruptModes[mode] << 4)]
      );
      this._simple_cmd.reset();
    }, this);
    test.done();
  }
};

exports['Tessel.I2C'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    }.bind(this));

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this._tx = sandbox.stub(Tessel.Port.prototype, '_tx');
    this._rx = sandbox.stub(Tessel.Port.prototype, '_rx');
    this._simple_cmd = sandbox.stub(Tessel.Port.prototype, '_simple_cmd');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  enableOnceOnly: function(test) {
    test.expect(4);

    test.equal(this.port.I2C.enabled, false);

    new Tessel.I2C({
      address: 0x01,
      mode: undefined,
      port: this.port
    });

    new Tessel.I2C({
      address: 0x01,
      mode: undefined,
      port: this.port
    });

    test.equal(this.port.I2C.enabled, true);
    test.equal(this._simple_cmd.callCount, 1);
    test.deepEqual(this._simple_cmd.lastCall.args[0], [CMD.ENABLE_I2C, 234]);

    test.done();
  },

  explicitFreqChangesBaud: function(test) {
    test.expect(1);

    this.computeBaud = sandbox.stub(Tessel.I2C, 'computeBaud', function() {
      return 255;
    });

    new Tessel.I2C({
      address: 0x01,
      freq: 400000, // 400khz
      mode: undefined,
      port: this.port
    });

    test.deepEqual(this._simple_cmd.lastCall.args[0], [CMD.ENABLE_I2C, 255]);

    test.done();
  },

  read: function(test) {
    test.expect(8);

    var device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    var handler = function() {};

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this._simple_cmd.reset();

    device.read(4, handler);

    test.equal(device._port.cork.callCount, 1);
    test.equal(device._port._simple_cmd.callCount, 2);
    test.equal(device._port._rx.callCount, 1);
    test.equal(device._port.uncork.callCount, 1);

    test.deepEqual(device._port._rx.firstCall.args[0], 4);
    test.equal(device._port._rx.firstCall.args[1], handler);

    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, 0x01]);
    test.deepEqual(device._port._simple_cmd.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

  send: function(test) {
    test.expect(7);

    var device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this._simple_cmd.reset();

    device.send([0, 1, 2, 3], function() {});

    test.equal(device._port.cork.callCount, 1);
    test.equal(device._port._simple_cmd.callCount, 2);
    test.equal(device._port._tx.callCount, 1);
    test.equal(device._port.uncork.callCount, 1);

    test.deepEqual(device._port._tx.firstCall.args[0], [0, 1, 2, 3]);

    // TODO: Find out why pre-_tx is `this.addr << 1` vs pre-_rx: `this.addr << 1 | 1`
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, 0x00]);
    test.deepEqual(device._port._simple_cmd.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

  transfer: function(test) {
    test.expect(11);

    var device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    var handler = function() {};

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this._simple_cmd.reset();

    device.transfer([0, 1, 2, 3], 4, handler);

    test.equal(device._port.cork.callCount, 1);
    test.equal(device._port._simple_cmd.callCount, 3);
    test.equal(device._port._tx.callCount, 1);
    test.equal(device._port._rx.callCount, 1);
    test.equal(device._port.uncork.callCount, 1);

    test.deepEqual(device._port._tx.firstCall.args[0], [0, 1, 2, 3]);
    test.deepEqual(device._port._rx.firstCall.args[0], 4);
    test.equal(device._port._rx.firstCall.args[1], handler);

    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, 0x00]);
    test.deepEqual(device._port._simple_cmd.secondCall.args[0], [CMD.START, 0x01]);
    test.deepEqual(device._port._simple_cmd.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

};

exports['Tessel.I2C.computeBaud'] = {
  enforceBaudRateCalculationAlgorithm: function(test) {
    test.expect(4);

    test.equal(Tessel.I2C.computeBaud(4e5), 54);
    test.equal(Tessel.I2C.computeBaud(9e4), 255);

    // Max frequency of 400khz
    test.equal(Tessel.I2C.computeBaud(4e5 + 1), 54);

    // Min frequency of 90khz
    test.equal(Tessel.I2C.computeBaud(9e4 - 1), 255);

    test.done();
  },
};

exports['Tessel.UART'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    }.bind(this));

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this._tx = sandbox.stub(Tessel.Port.prototype, '_tx');
    this._rx = sandbox.stub(Tessel.Port.prototype, '_rx');
    this._simple_cmd = sandbox.stub(Tessel.Port.prototype, '_simple_cmd');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.uartDisable = sandbox.spy(Tessel.UART.prototype, 'disable');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  interfaceChange: function(test) {
    test.expect(3);

    var b1 = 9600;
    var b2 = 115200;

    var uart = new this.port.UART({
      baudrate: b1
    });

    test.equal(uart._baudrate, b1);

    uart = new this.port.UART({
      baudrate: b2
    });

    test.ok(this.uartDisable.calledOnce, true);

    test.equal(uart._baudrate, b2);

    test.done();
  },

  oneUARTAtATime: function(test) {
    test.expect(4);

    var u1 = new this.port.UART();

    var u2 = new this.port.UART();

    test.notStrictEqual(u1, u2);

    test.notStrictEqual(this.port._uart, u1);

    test.strictEqual(this.port._uart, u2);

    test.ok(this.uartDisable.calledOnce, true);

    test.done();
  }
};

exports['Tessel.SPI'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    }.bind(this));

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this._tx = sandbox.stub(Tessel.Port.prototype, '_tx');
    this._rx = sandbox.stub(Tessel.Port.prototype, '_rx');
    this._simple_cmd = sandbox.stub(Tessel.Port.prototype, '_simple_cmd');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.spiDisable = sandbox.spy(Tessel.SPI.prototype, 'disable');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  interfaceChange: function(test) {
    test.expect(3);

    var s1 = 1e6;
    var s2 = 1e4;

    var spi = new this.port.SPI({
      clockSpeed: s1
    });

    test.equal(spi.clockSpeed, s1);

    spi = new this.port.SPI({
      clockSpeed: s2
    });

    test.ok(this.spiDisable.calledOnce, true);

    test.equal(spi.clockSpeed, s2);

    test.done();
  },

  oneSPIAtATime: function(test) {
    test.expect(4);

    var s1 = new this.port.SPI();

    var s2 = new this.port.SPI();

    test.notStrictEqual(s1, s2);

    test.notStrictEqual(this.port._spi, s1);

    test.strictEqual(this.port._spi, s2);

    test.ok(this.spiDisable.calledOnce, true);

    test.done();
  }
};
