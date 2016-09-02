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
var childProcess = require('child_process');

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

  closeBoth: function(test) {
    test.expect(1);

    var spy = sandbox.spy();

    this.tessel.port.A.close = spy;
    this.tessel.port.B.close = spy;

    this.tessel.close();

    test.equal(spy.callCount, 2);
    test.done();
  },

  closeSpecificA: function(test) {
    test.expect(2);

    this.tessel.port.A.close = sandbox.spy();
    this.tessel.port.B.close = sandbox.spy();

    this.tessel.close('A');

    test.equal(this.tessel.port.A.close.callCount, 1);
    test.equal(this.tessel.port.B.close.callCount, 0);
    test.done();
  },

  closeSpecificB: function(test) {
    test.expect(2);

    this.tessel.port.A.close = sandbox.spy();
    this.tessel.port.B.close = sandbox.spy();

    this.tessel.close('B');

    test.equal(this.tessel.port.A.close.callCount, 0);
    test.equal(this.tessel.port.B.close.callCount, 1);
    test.done();
  },

  openOnlyIfNotAlreadyOpen: function(test) {
    test.expect(1);

    Tessel.Port.reset();

    var destroyed = false;
    var sock = {
      destroyed
    };

    this.tessel.port.A = {
      sock
    };
    this.tessel.port.B = {
      sock
    };

    this.tessel.open('A');
    this.tessel.open('B');

    test.equal(Tessel.Port.callCount, 0);
    test.done();
  },

  openInstantiatesTesselPortWithTheseArgs: function(test) {
    test.expect(7);

    test.equal(Tessel.Port.firstCall.args[0], 'A');
    test.equal(Tessel.Port.lastCall.args[0], 'B');

    Tessel.Port.reset();

    this.tessel.port.A = null;

    this.tessel.open('A');

    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(Tessel.Port.callCount, 1);
    test.equal(Tessel.Port.lastCall.args[0], 'A');
    test.equal(Tessel.Port.lastCall.args[1], Tessel.Port.PATH.A);
    test.equal(Tessel.Port.lastCall.args[2], this.tessel);
    test.done();
  },

  openBothFromNothing: function(test) {
    test.expect(3);

    Tessel.Port.reset();

    this.tessel.port.A = null;
    this.tessel.port.B = null;

    this.tessel.open();

    test.equal(Tessel.Port.callCount, 2);
    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(this.tessel.port.B instanceof Tessel.Port, true);

    test.done();
  },

  openBothFromPreviouslyDestroyedPort: function(test) {
    test.expect(3);

    Tessel.Port.reset();

    var destroyed = true;

    this.tessel.port.A.sock = {
      destroyed
    };
    this.tessel.port.B.sock = {
      destroyed
    };

    this.tessel.open();

    test.equal(Tessel.Port.callCount, 2);
    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(this.tessel.port.B instanceof Tessel.Port, true);

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

  networkWifiInitialized: function(test) {
    test.expect(1);
    test.equal(this.tessel.network.wifi instanceof Tessel.Wifi, true);

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
    test.equal(port.pwm.length, 2);
    test.ok(port.sock);
    test.ok(port.I2C);
    test.equal(port.I2C.enabled, false);
    test.ok(port.SPI);
    test.ok(port.UART);

    test.done();
  },

  isAllowedToCloseFalse: function(test) {
    test.expect(1);

    var port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.sock.isAllowedToClose, false);
    test.done();
  },

  isAllowedToCloseTrue: function(test) {
    test.expect(5);

    var spy = sandbox.spy();
    var A = this.tessel.port.A;
    var B = this.tessel.port.B;

    test.equal(A.sock.isAllowedToClose, false);
    test.equal(B.sock.isAllowedToClose, false);

    // If any error is emitted, the test will fail.
    A.sock.destroy = () => {
      A.sock.emit('close');
    };
    B.sock.destroy = () => {
      B.sock.emit('close');
    };

    A.sock.on('close', spy);
    B.sock.on('close', spy);

    this.tessel.close();

    test.equal(A.sock.isAllowedToClose, true);
    test.equal(B.sock.isAllowedToClose, true);
    test.equal(spy.callCount, 2);
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

  close: function(test) {
    test.expect(3);

    var spy = sandbox.spy();
    this.tessel.port.A.sock.destroy = spy;

    test.equal(this.tessel.port.A.sock.isAllowedToClose, false);

    this.tessel.port.A.close();

    test.equal(this.tessel.port.A.sock.isAllowedToClose, true);
    test.equal(spy.callCount, 1);

    test.done();
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

  I2CnoArgsAlwaysHasPort: function(test) {
    test.expect(3);

    var device1 = new this.port.I2C();

    test.equal(device1 instanceof Tessel.I2C, true);

    test.equal(Tessel.I2C.callCount, 1);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithAddressArg: function(test) {
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

  I2CwithOptsAlwaysHasPort: function(test) {
    test.expect(4);

    var device1 = new this.port.I2C({
      address: 0x00
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    test.equal(Tessel.I2C.callCount, 1);
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithOptsWrongPortOverridden: function(test) {
    test.expect(3);

    var device1 = new this.port.I2C({
      address: 0x00,
      port: this.b
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    // The correct port always overrides...
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithOptsForwarded: function(test) {
    test.expect(4);

    var device1 = new this.port.I2C({
      address: 0x00,
      frequency: 1e5,
      port: this.b
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    // The correct port always overrides...
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].frequency, 1e5);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

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
    test.expect(46);

    var pins = [];

    for (var i = 0; i < 8; i++) {
      var intSupported = Tessel.Pin.interruptCapablePins.indexOf(i) !== -1;
      var adcSupported = Tessel.Pin.adcCapablePins.indexOf(i) !== -1;
      var pullSupported = Tessel.Pin.pullCapablePins.indexOf(i) !== -1;
      pins.push(
        new Tessel.Pin(i, this.a, intSupported, adcSupported, pullSupported)
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

    // Pull resistors on 2-7
    test.equal(pins[0].pullSupported, false);
    test.equal(pins[1].pullSupported, false);
    test.equal(pins[2].pullSupported, true);
    test.equal(pins[3].pullSupported, true);
    test.equal(pins[4].pullSupported, true);
    test.equal(pins[5].pullSupported, true);
    test.equal(pins[6].pullSupported, true);
    test.equal(pins[7].pullSupported, true);

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
    test.expect(52);

    var pins = [];

    for (var i = 0; i < 8; i++) {
      var intSupported = Tessel.Pin.interruptCapablePins.indexOf(i) !== -1;
      var pullSupported = Tessel.Pin.pullCapablePins.indexOf(i) !== -1;
      pins.push(
        new Tessel.Pin(i, this.b, intSupported, true, pullSupported)
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

    // Pull resistors on 2-7
    test.equal(pins[0].pullSupported, false);
    test.equal(pins[1].pullSupported, false);
    test.equal(pins[2].pullSupported, true);
    test.equal(pins[3].pullSupported, true);
    test.equal(pins[4].pullSupported, true);
    test.equal(pins[5].pullSupported, true);
    test.equal(pins[6].pullSupported, true);
    test.equal(pins[7].pullSupported, true);

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

  interruptErrorMessages: function(test) {
    test.expect(4);

    var spy = sandbox.spy();

    try {
      this.a.pin[0].once('test', spy);
    } catch (error) {
      test.equal(error.message, 'Invalid pin event mode "test". Valid modes are "change", "rise", "fall", "high" and "low".');
    }

    try {
      this.a.pin[0].once('low', spy);
    } catch (error) {
      test.equal(error.message, 'Interrupts are not supported on pin 0. Pins 2, 5, 6, and 7 on either port support interrupts.');
    }

    try {
      this.a.pin[2].on('low', spy);
    } catch (error) {
      test.equal(error.message, 'Cannot use "on" with level interrupts. You can only use "once".');
    }

    // Set 'change', 'fall' and 'rise' before setting 'low' to verify that it allows these to be set simultaneously.
    // It will fail the test on the error message match if it doesn't allow them to be set simultaneously the way it should
    try {
      this.a.pin[2].on('change', spy);
      this.a.pin[2].on('fall', spy);
      this.a.pin[2].on('rise', spy);
      this.a.pin[2].once('low', spy);
    } catch (error) {
      test.equal(error.message, 'Cannot set pin interrupt mode to "low"; already listening for "change". Can only set multiple listeners with "change", "rise" & "fall".');
    }

    test.done();
  },

  levelInterruptInvalidPin: function(test) {
    test.expect(16);

    var spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].once('high', spy));
      test.throws(() => this.a.pin[pinIndex].once('low', spy));
      test.throws(() => this.b.pin[pinIndex].once('high', spy));
      test.throws(() => this.b.pin[pinIndex].once('low', spy));
    });

    test.done();
  },

  interruptRiseInvalidPin: function(test) {
    test.expect(8);

    var spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].on('rise', spy));
      test.throws(() => this.b.pin[pinIndex].on('rise', spy));
    });

    test.done();
  },

  interruptFallInvalidPin: function(test) {
    test.expect(8);

    var spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].on('fall', spy));
      test.throws(() => this.b.pin[pinIndex].on('fall', spy));
    });

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

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
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

  interruptChangeStateLow: function(test) {
    test.expect(17);

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

    for (var i = 0; i < 8; i++) {
      test.equal(spy.getCall(i).args[0], 0);
    }

    test.done();
  },

  interruptChangeStateHigh: function(test) {
    test.expect(17);

    var spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.b.pin[pinIndex].on('change', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);

    for (var i = 0; i < 8; i++) {
      test.equal(spy.getCall(i).args[0], 1);
    }

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
  },

  // It should throw an error if an invalid pull mode is provided
  invalidPullParam: function(test) {
    test.expect(1);

    test.throws(function() {
      this.a.pin[2].pull('invalid');
    }, Error);

    test.done();
  },

  // It should throw an error if a pin is not compatible with pulls
  pullIncompatiblePin: function(test) {
    test.expect(1);

    test.throws(function() {
      this.a.pin[0].pull('pullup');
    }, Error);

    test.done();
  },

  // It should default to `none` pull if one was not provided
  noModeDefaultNone: function(test) {
    test.expect(2);
    var pin = 2;
    this.a.pin[pin].pull();

    test.equal(this._simple_cmd.callCount, 1);

    test.deepEqual(
      this._simple_cmd.lastCall.args[0], [CMD.GPIO_PULL, pin | (Tessel.Pin.pullModes['none'] << 4)]
    );

    test.done();
  },

  // It should send the right packets for valid pull modes
  setAllValidModes: function(test) {
    test.expect(6);
    var pin = 2;
    ['pulldown', 'pullup', 'none', ].forEach(function(pullMode) {
      this.a.pin[pin].pull(pullMode);

      test.equal(this._simple_cmd.callCount, 1);
      test.deepEqual(
        this._simple_cmd.lastCall.args[0], [CMD.GPIO_PULL, pin | (Tessel.Pin.pullModes[pullMode] << 4)]
      );
      this._simple_cmd.reset();
    }, this);
    test.done();
  },

  analogWritePortAndPinRangeError: function(test) {
    test.expect(16);

    this.a.pin.forEach(pin => {
      test.throws(() => {
        pin.analogWrite(1);
      }, RangeError);
    });

    this.b.pin.slice(0, -1).forEach(pin => {
      test.throws(() => {
        pin.analogWrite(1);
      }, RangeError);
    });

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(1);
    });

    test.done();
  },

  analogWriteValueRangeError: function(test) {
    test.expect(6);

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(0);
    }, RangeError);

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(1.0);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(-1);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(255);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(3.4);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(1.1);
    }, RangeError);

    test.done();
  },

  analogReadPortAndPinRangeWarning: function(test) {
    test.expect(16);

    var cb = function() {};

    this.a.pin.forEach(pin => {
      if (pin.pin === 4 || pin.pin === 7) {
        test.doesNotThrow(() => {
          pin.analogRead(cb);
        }, RangeError);
      } else {
        test.throws(() => {
          pin.analogRead(cb);
        }, RangeError);
      }
    });

    this.b.pin.forEach(pin => {
      test.doesNotThrow(() => {
        pin.analogRead(cb);
      }, RangeError);
    });

    test.done();
  },

  analogReadAsyncWarning: function(test) {
    test.expect(10);

    test.throws(() => {
      this.a.pin[4].analogRead();
    });

    test.throws(() => {
      this.a.pin[7].analogRead();
    });

    this.b.pin.forEach(pin => {
      test.throws(() => {
        pin.analogRead();
      });
    });

    test.done();
  },

  analogReadReceivesCorrectValuesLower: function(test) {
    test.expect(1);

    var value = 0;

    this.a.pin[4].analogRead((error, value) => {
      test.equal(value, 0);
      test.done();
    });

    this.a.sock.read.returns(new Buffer([0x84, value & 0xFF, value >> 8]));
    this.a.sock.emit('readable');
  },

  analogReadReceivesCorrectValuesUpper: function(test) {
    test.expect(1);

    var value = 4096;

    this.a.pin[4].analogRead((error, value) => {

      test.equal(value, 1);
      test.done();
    });

    this.a.sock.read.returns(new Buffer([0x84, value & 0xFF, value >> 8]));
    this.a.sock.emit('readable');
  },

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

  shape: function(test) {
    test.expect(5);

    var device = new Tessel.I2C({
      address: 0x01,
      frequency: 1e5,
      port: this.port,
    });

    test.equal(typeof device.address !== 'undefined', true);
    test.equal(typeof device.addr !== 'undefined', true);
    test.equal(typeof device.baudrate !== 'undefined', true);
    test.equal(typeof device.frequency !== 'undefined', true);
    test.equal(typeof device._port !== 'undefined', true);

    test.done();
  },

  missingAddressArg: function(test) {
    test.expect(1);

    test.throws(() => {
      new Tessel.I2C({
        port: this.port
      });
    });

    test.done();
  },

  enableOnceOnly: function(test) {
    test.expect(4);

    test.equal(this.port.I2C.enabled, false);

    new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    test.equal(this.port.I2C.enabled, true);
    test.equal(this._simple_cmd.callCount, 1);
    test.deepEqual(this._simple_cmd.lastCall.args[0], [CMD.ENABLE_I2C, 234]);

    test.done();
  },

  frequencyStandardMode: function(test) {
    test.expect(5);

    var device1 = new Tessel.I2C({
      address: 0x04,
      frequency: 1e5,
      port: this.port,
    });
    var device2 = new Tessel.I2C({
      address: 0x04,
      frequency: 1e5,
      port: this.port,
    });

    test.notEqual(device1, device2);

    test.equal(device1.baudrate, 234);
    test.equal(device1.frequency, 100000);

    test.equal(device2.baudrate, 234);
    test.equal(device2.frequency, 100000);
    test.done();
  },

  frequencyFastMode: function(test) {
    test.expect(5);

    var device1 = new Tessel.I2C({
      address: 0x04,
      frequency: 4e5,
      port: this.port,
    });
    var device2 = new Tessel.I2C({
      address: 0x04,
      frequency: 4e5,
      port: this.port,
    });

    test.notEqual(device1, device2);

    test.equal(device1.baudrate, 54);
    test.equal(device1.frequency, 400000);

    test.equal(device2.baudrate, 54);
    test.equal(device2.frequency, 400000);
    test.done();
  },

  frequencyInvalid: function(test) {
    test.expect(2);

    test.throws(() => {
      new Tessel.I2C({
        address: 0x04,
        frequency: 4e5 + 1,
        port: this.port,
      });
    }, RangeError);
    test.throws(() => {
      new Tessel.I2C({
        address: 0x04,
        frequency: 1e5 - 1,
        port: this.port,
      });
    }, RangeError);

    test.done();
  },
  explicitFreqChangesBaud: function(test) {
    test.expect(1);

    this.computeBaud = sandbox.stub(Tessel.I2C, 'computeBaud', function() {
      return 255;
    });

    new Tessel.I2C({
      address: 0x01,
      frequency: 400000, // 400khz
      mode: undefined,
      port: this.port
    });

    test.deepEqual(this._simple_cmd.lastCall.args[0], [CMD.ENABLE_I2C, 255]);

    test.done();
  },

  read: function(test) {
    test.expect(9);

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

    // See:
    // Tessel.I2C.prototype.read
    // this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    //
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, device.addr << 1 | 1]);
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, device.address << 1 | 1]);
    test.deepEqual(device._port._simple_cmd.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

  send: function(test) {
    test.expect(8);

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

    // See:
    // Tessel.I2C.prototype.send
    // this._port._simple_cmd([CMD.START, this.addr << 1]);
    //
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, device.addr << 1]);
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, device.address << 1]);
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

    // See:
    // Tessel.I2C.prototype.transfer
    // this._port._simple_cmd([CMD.START, this.addr << 1]);
    // this._port._simple_cmd([CMD.START, this.addr << 1 | 1]);
    test.deepEqual(device._port._simple_cmd.firstCall.args[0], [CMD.START, device.addr << 1]);
    test.deepEqual(device._port._simple_cmd.secondCall.args[0], [CMD.START, device.addr << 1 | 1]);
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

    // Block creation of automatically generated ports
    this.tessel = new Tessel({
      ports: {
        'A': false,
        'B': false
      }
    });

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this._tx = sandbox.stub(Tessel.Port.prototype, '_tx');
    this._rx = sandbox.stub(Tessel.Port.prototype, '_rx');
    this._simple_cmd = sandbox.stub(Tessel.Port.prototype, '_simple_cmd');

    // Explicitly generate our own port
    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.uartDisable = sandbox.spy(Tessel.UART.prototype, 'disable');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  baudrateCmd: function(test) {
    test.expect(2);

    var b1 = 9600;

    new this.port.UART({
      baudrate: b1
    });

    test.equal(this._simple_cmd.callCount, 1);
    test.deepEqual(this._simple_cmd.lastCall.args[0], [14, 255, 46]);
    test.done();
  },

  baudrateSetterCmd: function(test) {
    test.expect(3);

    var b1 = 9600;

    var uart = new this.port.UART({
      baudrate: b1
    });

    uart.baudrate = 115200;

    test.equal(uart.baudrate, 115200);
    test.equal(this._simple_cmd.callCount, 2);
    test.deepEqual(this._simple_cmd.lastCall.args[0], [14, 246, 43]);
    test.done();
  },

  baudrateInvalidLow: function(test) {
    test.expect(2);

    var b1 = 9600;

    var uart = new this.port.UART({
      baudrate: b1
    });

    test.throws(() => uart.baudrate = 0);
    test.equal(uart.baudrate, b1);

    test.done();
  },

  baudrateInvalidHigh: function(test) {
    test.expect(2);

    var b1 = 9600;

    var uart = new this.port.UART({
      baudrate: b1
    });

    test.throws(() => uart.baudrate = 115201);
    test.equal(uart.baudrate, b1);

    test.done();
  },

  interfaceChange: function(test) {
    test.expect(3);

    var b1 = 9600;
    var b2 = 115200;

    var uart = new this.port.UART({
      baudrate: b1
    });

    test.equal(uart.baudrate, b1);

    uart = new this.port.UART({
      baudrate: b2
    });

    test.ok(this.uartDisable.calledOnce, true);

    test.equal(uart.baudrate, b2);

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
  },

  bufferOutput: function(test) {

    test.expect(2);

    // Create our Tessel port
    var u1 = new this.port.UART();

    // Buffers which we'll emit as mocked incoming UART data
    var payload = new Buffer([0x00, 0x0F, 0xF0, 0xFF]);
    var header = new Buffer([Tessel.REPLY.ASYNC_UART_RX, payload.length]);

    // Only return our test buffer on the first call, otherwise empty buff
    var called = false;
    this.socket.read = () => {
      if (called) {
        return new Buffer([]);
      }
      called = true;

      return Buffer.concat([header, payload]);
    };

    // When data is emitted on the uart peripheral
    u1.once('data', (shouldBeBuf) => {
      // Ensure it is a buffer (not a string)
      test.ok(Buffer.isBuffer(shouldBeBuf));
      // Ensure the payload is what is emitted
      test.deepEqual(shouldBeBuf, payload);
      test.done();
    });

    // Prod the socket to read our buffer
    u1._port.sock.emit('readable');
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

  clockSpeedRangeError: function(test) {
    test.expect(2);

    test.throws(() => {
      new this.port.SPI({
        clockSpeed: 368 - 1
      });
    }, RangeError);

    test.throws(() => {
      new this.port.SPI({
        clockSpeed: 24e6 + 1
      });
    }, RangeError);

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

exports['Tessel.Wifi'] = {
  setUp: function(done) {
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      callback();
    });
    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  initialized: function(test) {
    test.expect(1);

    test.deepEqual(this.tessel.network.wifi.settings, {}, 'no setings by default');

    test.done();
  },

  connect: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'wep'
    };
    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var ip = '192.168.1.101';
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wep: ['open']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectErrorNoSettings: function(test) {
    test.expect(1);

    test.throws(this.tessel.network.wifi.connect, 'throws without settings');
    test.done();
  },

  connectErrorNoSSID: function(test) {
    test.expect(1);

    test.throws(this.tessel.network.wifi.connect.bind({}), 'throws without ssid');
    test.done();
  },

  connectWithoutCallback: function(test) {
    test.expect(3);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk'
    };
    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var ip = '192.168.1.101';
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wpa: [1],
        authentication: ['psk']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');
      test.done();
    });

    this.tessel.network.wifi.on('error', (error) => {
      test.fail(error);
      test.done();
    });

    this.tessel.network.wifi.connect(settings);
  },

  connectWithoutSecurity: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword'
    };
    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var ip = '192.168.1.101';
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wpa: [2],
        authentication: ['psk']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip,
      security: 'psk2'
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectWithoutPassword: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork'
    };
    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var ip = '192.168.1.101';
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip,
      security: 'none'
    }, settings, network);

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectThrowsError: function(test) {
    test.expect(2);

    var settings = {
      ssid: 'TestNetwork'
    };
    var testError = 'This is a test';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('connect', () => {
      test.fail('should not connect');
      test.done();
    });

    this.tessel.network.wifi.on('error', (error) => {
      test.equal(error, testError, 'error event fires correctly');
    });

    this.tessel.network.wifi.connect(settings, (error) => {
      if (error) {
        test.equal(error, testError, 'error should be passed into callback');
        test.done();
      } else {
        test.fail('should not connect');
        test.done();
      }
    });
  },

  connection: function(test) {
    test.expect(2);

    var settings = {
      ssid: 'TestNetwork'
    };
    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var ip = '192.168.1.101';
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };
    var isFirstCheck = true;

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else if (cmd === `uci get wireless.@wifi-iface[0].disabled`) {
        if (isFirstCheck) {
          isFirstCheck = false;
          callback(null, 1);
        } else {
          callback(null, 0);
        }
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip,
      security: 'none'
    }, settings, network);

    this.tessel.network.wifi.connection((error, network) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.equal(network, null, 'no settings yet');

      this.tessel.network.wifi.connect(settings, (error) => {
        if (error) {
          test.fail(error);
          test.done();
        }

        this.tessel.network.wifi.connection((error, network) => {
          test.deepEqual(network, results, 'correct settings');
          test.done();
        });
      });
    });
  },

  reset: function(test) {
    test.expect(2);

    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('disconnect', () => {
      test.ok(true, 'disconnect event is fired');
    });
    this.tessel.network.wifi.on('connect', () => {
      test.ok(true, 'connect event is fired');
    });

    this.tessel.network.wifi.reset((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  disable: function(test) {
    test.expect(1);

    this.tessel.network.wifi.on('disconnect', () => {
      test.ok(true, 'disconnect event is fired');
    });

    this.tessel.network.wifi.disable((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  enable: function(test) {
    test.expect(1);

    var ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    var network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('connect', () => {
      test.ok(true, 'connect event is fired');
    });

    this.tessel.network.wifi.enable((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  findAvailableNetworks: function(test) {
    test.expect(3);

    var networks =
      `Cell 01 - Address: 14:35:8B:11:30:F0
              ESSID: "technicallyHome"
              Mode: Master  Channel: 11
              Signal: -55 dBm  Quality: 55/70
              Encryption: WPA PSK (TKIP, CCMP)

    Cell 02 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "Fried Chicken Sandwich"
              Mode: Master  Channel: 2
              Signal: -51 dBm  Quality: 59/70
              Encryption: WPA2 PSK (CCMP)

`;

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 2);
      test.equal(found[0].ssid, 'Fried Chicken Sandwich');
      test.equal(found[0].security, 'psk2');
      test.done();
    });
  },

  findNoNetworks: function(test) {
    test.expect(1);

    var networks = '';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 0);
      test.done();
    });
  },

  findNetworksSafe: function(test) {
    test.expect(7);

    var networks = `Cell 01 - Address: 14:35:8B:11:30:F0
              ESSID: "worst"
              Mode: Master  Channel: 11
              Signal: -55 dBm  Quality: 30/
              Encryption: WPA PSK (TKIP, CCMP)

    Cell 02 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "middle"
              Mode: Master  Channel: 2
              Signal: -57 dBm  Quality: 5/70
              Encryption: WPA2 PSK (CCMP)

    Cell 03 - Address: 6C:70:9F:D9:7A:5C
            ESSID: "best"
            Mode: Master  Channel: 2
            Signal: -57 dBm  Quality: 100
            Encryption: WPA2 PSK (CCMP)

`;
    // Do not remove the blank line at the end of preceding string!!

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 3);
      test.equal(found[0].ssid, 'best');
      test.equal(found[1].ssid, 'middle');
      test.equal(found[2].ssid, 'worst');

      test.equal(found[0].quality, '100');
      test.equal(found[1].quality, '5/70');
      test.equal(found[2].quality, '30/');
      test.done();
    });
  }
};

exports['Tessel.port.pwm'] = {
  setUp: function(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    }.bind(this));

    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  pwmArray: function(test) {
    test.expect(26);

    test.equal(this.tessel.port.A.pwm.length, 2);
    test.equal(this.tessel.port.A.pwm[0], this.tessel.port.A.digital[0]);
    test.ok(this.tessel.port.A.digital[0].pwmSupported);
    test.equal(this.tessel.port.A.pwm[1], this.tessel.port.A.digital[1]);
    test.ok(this.tessel.port.A.digital[1].pwmSupported);
    test.equal(this.tessel.port.B.pwm.length, 2);
    test.equal(this.tessel.port.B.pwm[0], this.tessel.port.B.digital[0]);
    test.ok(this.tessel.port.B.digital[0].pwmSupported);
    test.equal(this.tessel.port.B.pwm[1], this.tessel.port.B.digital[1]);
    test.ok(this.tessel.port.B.digital[1].pwmSupported);

    test.equal(this.tessel.port.A.pin[0].pwmSupported, false);
    test.equal(this.tessel.port.A.pin[1].pwmSupported, false);
    test.equal(this.tessel.port.A.pin[2].pwmSupported, false);
    test.equal(this.tessel.port.A.pin[3].pwmSupported, false);
    test.equal(this.tessel.port.A.pin[4].pwmSupported, false);
    test.equal(this.tessel.port.A.pin[5].pwmSupported, true);
    test.equal(this.tessel.port.A.pin[6].pwmSupported, true);
    test.equal(this.tessel.port.A.pin[7].pwmSupported, false);

    test.equal(this.tessel.port.B.pin[0].pwmSupported, false);
    test.equal(this.tessel.port.B.pin[1].pwmSupported, false);
    test.equal(this.tessel.port.B.pin[2].pwmSupported, false);
    test.equal(this.tessel.port.B.pin[3].pwmSupported, false);
    test.equal(this.tessel.port.B.pin[4].pwmSupported, false);
    test.equal(this.tessel.port.B.pin[5].pwmSupported, true);
    test.equal(this.tessel.port.B.pin[6].pwmSupported, true);
    test.equal(this.tessel.port.B.pin[7].pwmSupported, false);
    test.done();
  }
};

exports['determineDutyCycleAndPrescalar'] = {
  setUp: function(done) {
    done();
  },
  tearDown: function(done) {
    done();
  },
  onekHz: function(test) {
    test.expect(2);

    var frequency = 1000;
    var expectedPrescalar = 1;
    var results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  oneHundredHz: function(test) {
    test.expect(2);

    var frequency = 100;
    var expectedPrescalar = 8;
    var results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency / expectedPrescalar);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  oneHz: function(test) {
    test.expect(2);

    var frequency = 1;
    var expectedPrescalar = 1024;
    var results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency / expectedPrescalar);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  frequencyTooLow: function(test) {
    test.expect(1);
    var frequency = 0.1;
    try {
      Tessel.determineDutyCycleAndPrescalar(frequency);
    } catch (err) {
      test.ok(err);
    }

    test.done();
  }
};

exports['tessel.pwmFrequency'] = {
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

    this.pwmFrequency = sandbox.spy(Tessel.prototype, 'pwmFrequency');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },
  // Should throw an error if the frequency is outside the specified range
  frequencyTooLow: function(test) {
    test.expect(2);
    var frequency = Tessel.pwmMinFrequency / 2;

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the frequency
      this.tessel.pwmFrequency(frequency);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  // Should throw an error if the frequency is outside the specified range
  frequencyTooHigh: function(test) {
    test.expect(2);
    var frequency = Tessel.pwmMaxFrequency + 1;

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the frequency
      this.tessel.pwmFrequency(frequency);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },

  testPacketStructure: function(test) {
    var frequency = 100;
    this.tessel.pwmFrequency(frequency, (err) => {
      // Ensure no error was thrown
      test.ifError(err);
      // Finish the test
      test.done();
    });

    var results = Tessel.determineDutyCycleAndPrescalar(frequency);

    test.equal(this.socket.write.callCount, 1);
    var packet = this.socket.write.lastCall.args[0];
    var cb = this.socket.write.lastCall.args[1];
    // Ensure the callback was provided
    test.ok(typeof cb === 'function');
    // Ensure four bytes were passed
    test.ok(packet.length === 4);
    // Ensure the first packet is the PWM period
    test.ok(packet[0] === CMD.PWM_PERIOD);
    // Next four bits are TCC ID (always zero)
    test.ok((packet[1] & 0x7) === 0);
    // Next four bits are prescalar
    test.ok((packet[1] >> 4) === results.prescalarIndex);
    // Final two bits are period
    test.ok((packet[2] << 8) + packet[3] === results.period);
    // Call our callback
    cb();
  }
};

exports['pin.pwmDutyCycle'] = {
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

    this.pwmFrequency = sandbox.spy(Tessel.prototype, 'pwmFrequency');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },
  // Should throw an error if the pin does not support PWM
  pwmNotSupportedPin: function(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.digital[2].pwmDutyCycle(1);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  dutyCycleNotNumber: function(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle('five');
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  dutyCycleTooHigh: function(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(1.5);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  dutyCycleTooLow: function(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(-0.5);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  periodNotSet: function(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Reset the pwmPeriod
      Tessel.pwmBankSettings.period = 0;
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(0.5);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err.toString().includes('Frequency is not configured'));
      test.done();
    }
  },
  standardUsageSucceeds: function(test) {
    // Set some arbitrary non-zero period
    Tessel.pwmBankSettings.period = 10000;
    // Set some valid duty cycle value
    var dutyCycle = 0.5;
    var pin = this.tessel.port.A.pwm[0];
    pin.pwmDutyCycle(dutyCycle, (err) => {
      // Ensure no error was thrown
      test.ifError(err);
      // Finish the test
      test.done();
    });

    test.equal(this.socket.write.callCount, 1);
    var packet = this.socket.write.lastCall.args[0];
    var cb = this.socket.write.lastCall.args[1];
    // Ensure the callback was provided
    test.ok(typeof cb === 'function');
    // Ensure four bytes were passed
    test.ok(packet.length === 4);
    // Ensure the first packet is the PWM duty cycle command
    test.ok(packet[0] === CMD.PWM_DUTY_CYCLE);
    // Next byte is the pin ID
    test.ok(packet[1] === pin.pin);
    // Next two bytes are the duty cycle converted to ticks
    test.ok((packet[2] << 8) + packet[3] === dutyCycle * Tessel.pwmBankSettings.period);
    // Call our callback
    cb();
  }
};

exports['Tessel.AP'] = {
  setUp: function(done) {
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      callback();
    });
    this.tessel = new Tessel();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  initialized: function(test) {
    test.expect(1);

    test.deepEqual(this.tessel.network.ap.settings, {}, 'no setings by default');

    test.done();
  },

  create: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk2'
    };
    var ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, apSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(apSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createErrorNoSettings: function(test) {
    test.expect(1);

    test.throws(this.tessel.network.ap.create, 'throws without settings');
    test.done();
  },

  createErrorNoSSID: function(test) {
    test.expect(1);

    test.throws(this.tessel.network.ap.create.bind({}), 'throws without ssid');
    test.done();
  },

  createWithoutCallback: function(test) {
    test.expect(3);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk2'
    };
    var ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');
      test.done();
    });

    this.tessel.network.ap.on('error', (error) => {
      test.fail(error);
      test.done();
    });

    this.tessel.network.ap.create(settings);
  },

  createWithoutSecurity: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword'
    };
    var ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip,
      security: 'psk2'
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createWithoutPassword: function(test) {
    test.expect(4);

    var settings = {
      ssid: 'TestNetwork'
    };
    var ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    var results = Object.assign({
      ip: ip,
      password: '',
      security: 'none'
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createThrowsError: function(test) {
    test.expect(2);

    var settings = {
      ssid: 'TestNetwork'
    };
    var testError = 'This is a test';

    this.exec.restore();
    this.exec = sandbox.stub(childProcess, 'exec', (cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.ap.on('create', () => {
      test.fail('should not connect');
      test.done();
    });

    this.tessel.network.ap.on('error', (error) => {
      test.equal(error, testError, 'error event fires correctly');
    });

    this.tessel.network.ap.create(settings, (error) => {
      if (error) {
        test.equal(error, testError, 'error should be passed into callback');
        test.done();
      } else {
        test.fail('should not connect');
        test.done();
      }
    });
  },

  reset: function(test) {
    test.expect(5);

    this.tessel.network.ap.on('reset', () => {
      test.ok(true, 'reset event is fired');
    });

    this.tessel.network.ap.on('off', () => {
      test.ok(true, 'off event is fired');
    });
    this.tessel.network.ap.on('on', () => {
      test.ok(true, 'on event is fired');
    });

    this.tessel.network.ap.on('disable', () => {
      test.ok(true, 'disable event is fired');
    });
    this.tessel.network.ap.on('enable', () => {
      test.ok(true, 'enable event is fired');
    });

    this.tessel.network.ap.reset((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  disable: function(test) {
    test.expect(2);

    this.tessel.network.ap.on('off', () => {
      test.ok(true, 'off event is fired');
    });

    this.tessel.network.ap.on('disable', () => {
      test.ok(true, 'disable event is fired');
    });

    this.tessel.network.ap.disable((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  enable: function(test) {
    test.expect(2);

    this.tessel.network.ap.on('on', () => {
      test.ok(true, 'on event is fired');
    });

    this.tessel.network.ap.on('enable', () => {
      test.ok(true, 'enable event is fired');
    });

    this.tessel.network.ap.enable((error) => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  }
};
