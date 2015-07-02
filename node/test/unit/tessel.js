process.env.IS_TEST_MODE = true;

var sinon = require('sinon');
var factory = require('../../tessel.js');
var version = 2;

// These are ONLY exported for testing.
var CMD = factory.CMD;
// var REPLY = factory.REPLY;
var Tessel = factory.Tessel;

// Shared sinon sandbox
var sandbox = sinon.sandbox.create();

// Used within tessel.js, can be stubs/spies
// Uncomment as necessary.
//
// var util = require('util');
var EventEmitter = require('events').EventEmitter;
// var Duplex = require('stream').Duplex;
var net = require('net');
// var fs = require('fs');


exports['Tessel'] = {
  setUp: function(done) {
    this.LED = sandbox.stub(Tessel, 'LED');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.tessel = factory();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  // exportsInstance: function(test) {
  //   test.expect(1);
  //   test.equal(this.tessel instanceof Tessel, true);
  //   test.done();
  // },

  instanceReused: function(test) {
    test.expect(1);
    test.equal(new Tessel(), this.tessel);
    test.done();
  },

  instanceProperties: function(test) {
    test.expect(4);
    test.notEqual(typeof this.tessel.ports, undefined);
    test.notEqual(typeof this.tessel.port, undefined);
    test.notEqual(typeof this.tessel.led, undefined);
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
  }
};

exports['Tessel.Port'] = {
  setUp: function(done) {
    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      return new EventEmitter();
    });

    this.tessel = factory();
    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  instanceProperties: function(test) {
    test.expect(10);

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

  /*
  TODO:
  readable: function(test) {
    test.expect(1);

    // Emit data via `readable` event
    // Assert correct outcomes

    test.done();
  },
  */
};

exports['Tessel.Port.prototype'] = {
  setUp: function(done) {
    this.socket = new EventEmitter();

    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    }.bind(this));

    this.tessel = factory();

    this.I2C = sandbox.stub(Tessel, 'I2C');
    this.SPI = sandbox.stub(Tessel, 'SPI');
    this.UART = sandbox.stub(Tessel, 'UART');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);
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

  _i2c: function(test) {
    test.expect(5);

    test.equal(this.port._i2c, undefined);

    this.port.I2C(0x00);

    test.notEqual(this.port._i2c, undefined);
    test.equal(Tessel.I2C.callCount, 1);
    test.deepEqual(Tessel.I2C.lastCall.args[0], {
      addr: 0x00,
      mode: undefined
    });
    test.equal(this.port._i2c instanceof Tessel.I2C, true);

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
  /*
  TODO:

  _tx: function(test) {
    test.expect();
    test.done();
  },
  _rx: function(test) {
    test.expect();
    test.done();
  },
  _txrx: function(test) {
    test.expect();
    test.done();
  },

  */
};
